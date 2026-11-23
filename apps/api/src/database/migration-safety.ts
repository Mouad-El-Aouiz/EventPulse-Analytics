import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROTECTED_OBJECTS } from './integrity-manifest.js';

export interface MigrationFile {
  path: string;
  sql: string;
}

export interface MigrationFinding {
  file: string;
  line: number;
  message: string;
}

type ProtectedObjectType =
  | 'table'
  | 'constraint'
  | 'index'
  | 'trigger'
  | 'function'
  | 'schema'
  | 'database'
  | 'extension'
  | 'role';

type GuardOperation = 'DROP' | 'ALTER' | 'CREATE' | 'TRUNCATE';

interface RawDirective {
  line: number;
  text: string;
}

interface GuardDirective {
  line: number;
  operation?: GuardOperation;
  objectType: ProtectedObjectType;
  name: string;
  justification: string;
  used: boolean;
}

interface Statement {
  sanitized: string;
  raw: string;
  startLine: number;
  endLine: number;
  directives: GuardDirective[];
}

interface DollarBody {
  text: string;
  startLine: number;
}

interface LexResult {
  statements: Statement[];
  directives: RawDirective[];
  dollarBodies: DollarBody[];
  errors: Array<{ line: number; message: string }>;
}

const PROTECTED_SETS: Record<Exclude<ProtectedObjectType, 'database'>, ReadonlySet<string>> = {
  table: PROTECTED_OBJECTS.tables,
  constraint: PROTECTED_OBJECTS.constraints,
  index: PROTECTED_OBJECTS.indexes,
  trigger: PROTECTED_OBJECTS.triggers,
  function: PROTECTED_OBJECTS.functions,
  schema: PROTECTED_OBJECTS.schemas,
  extension: PROTECTED_OBJECTS.extensions,
  role: PROTECTED_OBJECTS.roles,
};

const DIRECTIVE_PATTERN =
  /^integrity-guard\s*:\s*allow\s+(?:(DROP|ALTER|CREATE|TRUNCATE)\s+)?(TABLE|CONSTRAINT|INDEX|TRIGGER|FUNCTION|SCHEMA|DATABASE|EXTENSION|ROLE)\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+(.+)$/i;

const UNSUPPORTED_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\bCREATE\s+PROCEDURE\b/i,
    message: 'CREATE PROCEDURE is not analyzed by the migration guard',
  },
  {
    pattern: /\bCREATE\s+EVENT\s+TRIGGER\b/i,
    message: 'CREATE EVENT TRIGGER is not analyzed by the migration guard',
  },
  {
    pattern: /^\s*PREPARE\b/i,
    message: 'PREPARE is not analyzed by the migration guard',
  },
  {
    pattern: /\bEXECUTE\s+(?!FUNCTION\b|PROCEDURE\b)/i,
    message: 'Dynamic SQL EXECUTE cannot be analyzed by the migration guard',
  },
  {
    pattern: /\bCOPY\b[\s\S]*\bFROM\s+PROGRAM\b/i,
    message: 'COPY FROM PROGRAM is not analyzed by the migration guard',
  },
  {
    pattern: /\bALTER\s+TABLE\b[\s\S]*\bRENAME\s+TO\b/i,
    message: 'ALTER TABLE RENAME TO is not analyzed by the migration guard',
  },
  {
    pattern: /\bALTER\s+TABLE\b[\s\S]*\bSET\s+SCHEMA\b/i,
    message: 'ALTER TABLE SET SCHEMA is not analyzed by the migration guard',
  },
  {
    pattern: /\bALTER\s+TRIGGER\b[\s\S]*\bRENAME\s+TO\b/i,
    message: 'ALTER TRIGGER RENAME is not analyzed by the migration guard',
  },
  {
    pattern: /\bALTER\s+INDEX\b[\s\S]*\bRENAME\s+TO\b/i,
    message: 'ALTER INDEX RENAME is not analyzed by the migration guard',
  },
  {
    pattern: /\bALTER\s+ROLE\b[\s\S]*\bRENAME\s+TO\b/i,
    message: 'ALTER ROLE RENAME is not analyzed by the migration guard',
  },
  {
    pattern: /\bALTER\s+SCHEMA\b[\s\S]*\bRENAME\s+TO\b/i,
    message: 'ALTER SCHEMA RENAME is not analyzed by the migration guard',
  },
  {
    pattern: /\bALTER\s+FUNCTION\b[\s\S]*\bRENAME\s+TO\b/i,
    message: 'ALTER FUNCTION RENAME is not analyzed by the migration guard',
  },
];

function finding(file: string, line: number, message: string): MigrationFinding {
  return { file, line, message };
}

function isProtected(type: ProtectedObjectType, name: string): boolean {
  if (type === 'database') {
    return true;
  }

  return PROTECTED_SETS[type].has(name);
}

function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }

  return trimmed.toLowerCase();
}

function lastIdentifier(fragment: string): string | null {
  const cleaned = fragment.replace(/\b(?:CASCADE|RESTRICT)\s*$/i, '').trim();
  const matches = [...cleaned.matchAll(/(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/g)];
  const last = matches[matches.length - 1];

  if (last === undefined) {
    return null;
  }

  return last[1] !== undefined ? last[1] : (last[2] ?? '').toLowerCase();
}

function identifierBeforeParenthesis(fragment: string): string | null {
  const open = fragment.indexOf('(');
  return lastIdentifier(open === -1 ? fragment : fragment.slice(0, open));
}

function splitTopLevelList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inDoubleQuote = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char === '"') {
      if (inDoubleQuote && value[index + 1] === '"') {
        index += 1;
      } else {
        inDoubleQuote = !inDoubleQuote;
      }
      continue;
    }
    if (inDoubleQuote) {
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function countNewlines(value: string): number {
  let count = 0;
  for (const char of value) {
    if (char === '\n') {
      count += 1;
    }
  }
  return count;
}

function scanSql(sql: string): LexResult {
  const sanitized = sql.split('');
  const statements: Statement[] = [];
  const directives: RawDirective[] = [];
  const dollarBodies: DollarBody[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  const length = sql.length;
  let line = 1;
  let statementStart = 0;
  let statementStartLine = 1;
  let statementHasContent = false;
  let index = 0;

  const blank = (start: number, end: number): void => {
    for (let position = start; position < end; position += 1) {
      if (sanitized[position] !== '\n' && sanitized[position] !== '\r') {
        sanitized[position] = ' ';
      }
    }
  };

  const registerContent = (): void => {
    if (!statementHasContent) {
      statementHasContent = true;
      statementStartLine = line;
    }
  };

  const finishStatement = (end: number): void => {
    const text = sanitized.slice(statementStart, end).join('');
    const raw = sql.slice(statementStart, end);

    if (text.trim().length > 0) {
      statements.push({
        sanitized: text,
        raw,
        startLine: statementStartLine,
        endLine: line,
        directives: [],
      });
    }

    statementStart = end + 1;
    statementHasContent = false;
  };

  while (index < length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (char === '-' && next === '-') {
      const newline = sql.indexOf('\n', index);
      const end = newline === -1 ? length : newline;
      const text = sql.slice(index, end);

      if (/\bintegrity-guard\b/i.test(text)) {
        directives.push({ line, text });
      }

      blank(index, end);
      index = end;
      continue;
    }

    if (char === '/' && next === '*') {
      const startLine = line;
      let depth = 1;
      let position = index + 2;

      while (position < length && depth > 0) {
        if (sql[position] === '/' && sql[position + 1] === '*') {
          depth += 1;
          position += 2;
          continue;
        }
        if (sql[position] === '*' && sql[position + 1] === '/') {
          depth -= 1;
          position += 2;
          continue;
        }
        if (sql[position] === '\n') {
          line += 1;
        }
        position += 1;
      }

      if (depth > 0) {
        errors.push({
          line: startLine,
          message: 'Unterminated block comment; migration cannot be analyzed safely',
        });
        blank(index, length);
        index = length;
        continue;
      }

      blank(index, position);
      index = position;
      continue;
    }

    if (char === "'") {
      registerContent();
      let position = index + 1;
      let closed = false;

      while (position < length) {
        if (sql[position] === '\\') {
          position += 2;
          continue;
        }
        if (sql[position] === "'") {
          if (sql[position + 1] === "'") {
            position += 2;
            continue;
          }
          position += 1;
          closed = true;
          break;
        }
        if (sql[position] === '\n') {
          line += 1;
        }
        position += 1;
      }

      if (!closed) {
        errors.push({
          line,
          message: 'Unterminated string literal; migration cannot be analyzed safely',
        });
      }

      blank(index, Math.min(position, length));
      index = Math.min(position, length);
      continue;
    }

    if (char === '"') {
      registerContent();
      let position = index + 1;
      let closed = false;

      while (position < length) {
        if (sql[position] === '"') {
          if (sql[position + 1] === '"') {
            position += 2;
            continue;
          }
          position += 1;
          closed = true;
          break;
        }
        if (sql[position] === '\n') {
          line += 1;
        }
        position += 1;
      }

      if (!closed) {
        errors.push({
          line,
          message: 'Unterminated quoted identifier; migration cannot be analyzed safely',
        });
      }

      index = Math.min(position, length);
      continue;
    }

    if (char === '$') {
      const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index));

      if (tagMatch !== null) {
        registerContent();
        const delimiter = tagMatch[0];
        const bodyStart = index + delimiter.length;
        const closing = sql.indexOf(delimiter, bodyStart);

        if (closing === -1) {
          errors.push({
            line,
            message: 'Unterminated dollar-quoted string; migration cannot be analyzed safely',
          });
          blank(index, length);
          index = length;
          continue;
        }

        const body = sql.slice(bodyStart, closing);
        dollarBodies.push({ text: body, startLine: line });
        blank(bodyStart, closing);
        line += countNewlines(body);
        index = closing + delimiter.length;
        continue;
      }
    }

    if (char === ';') {
      finishStatement(index);
      index += 1;
      continue;
    }

    if (char === '\n') {
      line += 1;
    }

    if (char !== undefined && char.trim().length > 0) {
      registerContent();
    }

    index += 1;
  }

  finishStatement(length);

  return { statements, directives, dollarBodies, errors };
}

function parseDirective(
  raw: RawDirective,
  file: string,
): { directive?: GuardDirective; finding?: MigrationFinding } {
  const body = raw.text.replace(/^--\s*/, '').trim();
  const match = DIRECTIVE_PATTERN.exec(body);

  if (match === null) {
    return {
      finding: finding(
        file,
        raw.line,
        'Malformed integrity-guard directive: expected "-- integrity-guard: allow <TYPE> <name> <justification>"',
      ),
    };
  }

  const operation = match[1]?.toUpperCase() as GuardOperation | undefined;
  const objectType = (match[2] ?? '').toLowerCase() as ProtectedObjectType;
  const name = match[3] !== undefined ? match[3] : normalizeIdentifier(match[4] ?? '');
  const justification = (match[5] ?? '').trim();

  if (name.length === 0 || justification.length === 0) {
    return {
      finding: finding(
        file,
        raw.line,
        'Malformed integrity-guard directive: object name and justification are required',
      ),
    };
  }

  return {
    directive: {
      line: raw.line,
      operation,
      objectType,
      name,
      justification,
      used: false,
    },
  };
}

function attachDirectives(
  file: string,
  lines: string[],
  statements: Statement[],
  rawDirectives: RawDirective[],
  allowDirectives: boolean,
  lineOffset: number,
): MigrationFinding[] {
  const findings: MigrationFinding[] = [];
  const statementsByStartLine = new Map<number, Statement>();

  for (const statement of statements) {
    if (!statementsByStartLine.has(statement.startLine)) {
      statementsByStartLine.set(statement.startLine, statement);
    }
  }

  const insideStatement = (line: number): Statement | undefined =>
    statements.find((statement) => line > statement.startLine && line <= statement.endLine);

  for (const raw of rawDirectives) {
    if (!allowDirectives) {
      findings.push(
        finding(
          file,
          lineOffset + raw.line,
          'Integrity-guard directives are not allowed inside executable bodies',
        ),
      );
      continue;
    }

    const physicalLine = lines[raw.line - 1 - lineOffset] ?? '';
    const commentStart = physicalLine.indexOf('--');
    if (commentStart > 0 && physicalLine.slice(0, commentStart).trim().length > 0) {
      findings.push(
        finding(
          file,
          lineOffset + raw.line,
          'Integrity-guard directive must be on its own line, not trailing an instruction',
        ),
      );
      continue;
    }

    const parsed = parseDirective({ ...raw, line: lineOffset + raw.line }, file);

    if (parsed.finding !== undefined) {
      findings.push(parsed.finding);
      continue;
    }

    const directive = parsed.directive;
    if (directive === undefined) {
      continue;
    }

    const containing = insideStatement(directive.line);
    if (containing !== undefined) {
      findings.push(
        finding(
          file,
          directive.line,
          'Integrity-guard directive is inside a statement; it must immediately precede the instruction it authorizes',
        ),
      );
      continue;
    }

    const target = statements.find((statement) => statement.startLine > directive.line);

    if (target === undefined) {
      findings.push(
        finding(
          file,
          directive.line,
          `Integrity-guard directive for ${directive.objectType} ${directive.name} is unused`,
        ),
      );
      continue;
    }

    let local = true;
    for (let line = directive.line + 1; line < target.startLine; line += 1) {
      const text = lines[line - 1 - lineOffset] ?? '';
      if (!/^\s*--/.test(text)) {
        local = false;
        break;
      }
    }

    if (!local) {
      findings.push(
        finding(
          file,
          directive.line,
          `Integrity-guard directive for ${directive.objectType} ${directive.name} is not local to the authorized statement`,
        ),
      );
      continue;
    }

    const duplicate = target.directives.find(
      (candidate) =>
        candidate.objectType === directive.objectType &&
        candidate.name === directive.name &&
        candidate.operation === directive.operation,
    );
    if (duplicate !== undefined) {
      findings.push(
        finding(
          file,
          directive.line,
          `Ambiguous duplicate integrity-guard directive for ${directive.objectType} ${directive.name}`,
        ),
      );
      continue;
    }

    target.directives.push(directive);
  }

  return findings;
}

function unusedDirectiveFindings(
  file: string,
  statements: Statement[],
  lineOffset: number,
): MigrationFinding[] {
  const findings: MigrationFinding[] = [];

  for (const statement of statements) {
    for (const directive of statement.directives) {
      if (!directive.used) {
        findings.push(
          finding(
            file,
            lineOffset + directive.line,
            `Integrity-guard directive for ${directive.objectType} ${directive.name} is unused or does not match the authorized operation`,
          ),
        );
      }
    }
  }

  return findings;
}

function handleProtectedObject(
  findings: MigrationFinding[],
  file: string,
  statement: Statement,
  type: ProtectedObjectType,
  name: string,
  operation: GuardOperation,
  message: string,
  allowDirective = true,
): void {
  if (!isProtected(type, name)) {
    return;
  }

  if (allowDirective) {
    const directive = statement.directives.find(
      (candidate) =>
        !candidate.used &&
        candidate.objectType === type &&
        candidate.name === name &&
        (candidate.operation === undefined || candidate.operation === operation),
    );

    if (directive !== undefined) {
      directive.used = true;
      return;
    }
  }

  findings.push(finding(file, statement.startLine, message));
}

function analyzeStatement(
  file: string,
  statement: Statement,
  lineOffset: number,
): MigrationFinding[] {
  const findings: MigrationFinding[] = [];
  const text = statement.sanitized;
  const line = statement.startLine + lineOffset;

  const report = (
    type: ProtectedObjectType,
    name: string,
    operation: GuardOperation,
    message: string,
    allowDirective = true,
  ): void => {
    handleProtectedObject(
      findings,
      file,
      { ...statement, startLine: line },
      type,
      name,
      operation,
      message,
      allowDirective,
    );
  };

  const dropTable = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(text);
  if (dropTable !== null) {
    for (const part of splitTopLevelList(dropTable[1] ?? '')) {
      const name = lastIdentifier(part);
      if (name !== null) {
        report(
          'table',
          name,
          'DROP',
          `Protected table ${name} is dropped; add a local, typed integrity-guard directive only for an approved replacement`,
        );
      }
    }
  }

  const dropIndex = /\bDROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(
    text,
  );
  if (dropIndex !== null) {
    for (const part of splitTopLevelList(dropIndex[1] ?? '')) {
      const name = lastIdentifier(part);
      if (name !== null) {
        report(
          'index',
          name,
          'DROP',
          `Protected index ${name} is dropped; add a local, typed integrity-guard directive only for an approved replacement`,
        );
      }
    }
  }

  for (const match of text.matchAll(
    /\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi,
  )) {
    const name = match[1] !== undefined ? match[1] : normalizeIdentifier(match[2] ?? '');
    report(
      'constraint',
      name,
      'DROP',
      `Protected constraint ${name} is dropped; add a local, typed integrity-guard directive only for an approved replacement`,
    );
  }

  for (const match of text.matchAll(
    /\bDROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi,
  )) {
    const name = match[1] !== undefined ? match[1] : normalizeIdentifier(match[2] ?? '');
    report(
      'trigger',
      name,
      'DROP',
      `Protected trigger ${name} is dropped; integrity triggers must stay active`,
    );
  }

  for (const match of text.matchAll(
    /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+CONSTRAINT\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+TO\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi,
  )) {
    const oldName = match[1] !== undefined ? match[1] : normalizeIdentifier(match[2] ?? '');
    const newName = match[3] !== undefined ? match[3] : normalizeIdentifier(match[4] ?? '');
    const name = isProtected('constraint', oldName) ? oldName : newName;
    report(
      'constraint',
      name,
      'ALTER',
      `Constraint ${oldName} is renamed to ${newName}; protected constraint names must stay stable`,
    );
  }

  for (const match of text.matchAll(
    /\bALTER\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+RENAME\s+TO\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi,
  )) {
    const oldName = match[1] !== undefined ? match[1] : normalizeIdentifier(match[2] ?? '');
    const newName = match[3] !== undefined ? match[3] : normalizeIdentifier(match[4] ?? '');
    const name = isProtected('index', oldName) ? oldName : newName;
    report(
      'index',
      name,
      'ALTER',
      `Index ${oldName} is renamed to ${newName}; protected index names must stay stable`,
    );
  }

  for (const match of text.matchAll(
    /\bALTER\s+TRIGGER\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+ON\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+RENAME\s+TO\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi,
  )) {
    const oldName = match[1] !== undefined ? match[1] : normalizeIdentifier(match[2] ?? '');
    const newName = match[5] !== undefined ? match[5] : normalizeIdentifier(match[6] ?? '');
    const name = isProtected('trigger', oldName) ? oldName : newName;
    report(
      'trigger',
      name,
      'ALTER',
      `Trigger ${oldName} is renamed to ${newName}; protected trigger names must stay stable`,
    );
  }

  for (const match of text.matchAll(
    /\bALTER\s+ROLE\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+RENAME\s+TO\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi,
  )) {
    const oldName = match[1] !== undefined ? match[1] : normalizeIdentifier(match[2] ?? '');
    const newName = match[3] !== undefined ? match[3] : normalizeIdentifier(match[4] ?? '');
    const name = isProtected('role', oldName) ? oldName : newName;
    report(
      'role',
      name,
      'ALTER',
      `Role ${oldName} is renamed to ${newName}; runtime role identity must stay stable`,
    );
  }

  for (const match of text.matchAll(
    /\bALTER\s+SCHEMA\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+RENAME\s+TO\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi,
  )) {
    const oldName = match[1] !== undefined ? match[1] : normalizeIdentifier(match[2] ?? '');
    const newName = match[3] !== undefined ? match[3] : normalizeIdentifier(match[4] ?? '');
    const name = isProtected('schema', oldName) ? oldName : newName;
    report(
      'schema',
      name,
      'ALTER',
      `Schema ${oldName} is renamed to ${newName}; protected schema names must stay stable`,
    );
  }

  const dropFunction = /\bDROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(text);
  if (dropFunction !== null) {
    for (const part of splitTopLevelList(dropFunction[1] ?? '')) {
      const name = identifierBeforeParenthesis(part);
      if (name !== null) {
        report(
          'function',
          name,
          'DROP',
          `Protected function ${name} is dropped; add a local, typed integrity-guard directive only for an approved replacement`,
        );
      }
    }
  }

  const replaceFunction = /\bCREATE\s+OR\s+REPLACE\s+FUNCTION\s+([\s\S]+)$/i.exec(text);
  if (replaceFunction !== null) {
    const name = identifierBeforeParenthesis(replaceFunction[1] ?? '');
    if (name !== null) {
      report(
        'function',
        name,
        'CREATE',
        `Protected function ${name} is replaced; add a local, typed integrity-guard directive with a justification`,
      );
    }
  }

  const alterFunction = /\bALTER\s+FUNCTION\s+([\s\S]+)$/i.exec(text);
  if (alterFunction !== null) {
    const name = identifierBeforeParenthesis(alterFunction[1] ?? '');
    if (name !== null) {
      report(
        'function',
        name,
        'ALTER',
        `Protected function ${name} is altered; add a local, typed integrity-guard directive with a justification`,
      );
    }
  }

  const dropExtension = /\bDROP\s+EXTENSION\s+(?:IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(text);
  if (dropExtension !== null) {
    for (const part of splitTopLevelList(dropExtension[1] ?? '')) {
      const name = lastIdentifier(part);
      if (name !== null) {
        report(
          'extension',
          name,
          'DROP',
          `Protected extension ${name} is dropped; documented search capabilities would be lost`,
        );
      }
    }
  }

  for (const match of text.matchAll(
    /\bDROP\s+ROLE\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi,
  )) {
    const name = match[1] !== undefined ? match[1] : normalizeIdentifier(match[2] ?? '');
    report(
      'role',
      name,
      'DROP',
      `Protected role ${name} is dropped; runtime isolation would be lost`,
    );
  }

  if (/\bDROP\s+SCHEMA\b/i.test(text)) {
    findings.push(finding(file, line, 'Drop schema statements are destructive and forbidden'));
  }

  if (/\bDROP\s+DATABASE\b/i.test(text)) {
    findings.push(finding(file, line, 'Drop database statements are destructive and forbidden'));
  }

  if (/\bDROP\s+OWNED\b/i.test(text)) {
    findings.push(finding(file, line, 'Drop owned statements are destructive and forbidden'));
  }

  if (/\bTRUNCATE\b/i.test(text)) {
    findings.push(finding(file, line, 'Truncate statements are destructive and forbidden'));
  }

  for (const match of text.matchAll(
    /\bDISABLE\s+TRIGGER\s+(?:ALL\b|USER\b|(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*)))/gi,
  )) {
    const name = match[1] ?? match[2] ?? 'ALL';
    findings.push(
      finding(file, line, `Trigger ${name} is disabled; integrity triggers must stay active`),
    );
  }

  for (const match of text.matchAll(
    /\bENABLE\s+(?:REPLICA|ALWAYS)\s+TRIGGER\b(?:\s+(?:ALL|USER|(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))))?/gi,
  )) {
    const name = match[1] ?? match[2] ?? 'ALL';
    findings.push(
      finding(
        file,
        line,
        `Trigger ${name} firing mode is changed; integrity triggers must keep their normal firing behavior`,
      ),
    );
  }

  if (/\bENABLE\s+(?!REPLICA\b|ALWAYS\b)TRIGGER\b/i.test(text)) {
    findings.push(
      finding(
        file,
        line,
        'Trigger re-enablement requires manual review; protected triggers must stay active and normally enabled',
      ),
    );
  }

  if (/\bSET\s+(?:LOCAL\s+|SESSION\s+)?ROLE\b/i.test(text)) {
    findings.push(
      finding(file, line, 'SET ROLE changes the effective privileges during a migration'),
    );
  }

  if (/\bSET\s+(?:LOCAL\s+|SESSION\s+)?SESSION\s+AUTHORIZATION\b/i.test(text)) {
    findings.push(finding(file, line, 'SET SESSION AUTHORIZATION is forbidden in migrations'));
  }

  if (/\bALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(text)) {
    findings.push(
      finding(
        file,
        line,
        'ALTER DEFAULT PRIVILEGES is forbidden; grants must stay explicit per protected table',
      ),
    );
  }

  if (/\bGRANT\s+ALL\b/i.test(text)) {
    findings.push(finding(file, line, 'GRANT ALL is too broad for protected tables and roles'));
  }

  if (/\bGRANT\b[\s\S]*?\bTO\s+(?:PUBLIC|"PUBLIC")\b/i.test(text)) {
    findings.push(finding(file, line, 'Granting privileges to PUBLIC is forbidden'));
  }

  if (
    /\bGRANT\b[\s\S]*?\b(?:TRUNCATE|REFERENCES|TRIGGER|CREATE)\b[\s\S]*?\bTO\s+(?:"eventpulse_app"|eventpulse_app\b)/i.test(
      text,
    )
  ) {
    findings.push(
      finding(
        file,
        line,
        'Runtime role must not receive TRUNCATE, REFERENCES, TRIGGER or CREATE privileges',
      ),
    );
  }

  if (
    /\bGRANT\b[\s\S]*?\b(?:UPDATE|DELETE)\b[\s\S]*?\bON\s+(?:TABLE\s+)?(?:"?(?:check_ins|refunds|audit_logs)"?)[\s\S]*?\bTO\s+(?:"eventpulse_app"|eventpulse_app\b)/i.test(
      text,
    )
  ) {
    findings.push(
      finding(file, line, 'Runtime role must not receive UPDATE or DELETE on immutable tables'),
    );
  }

  if (/\bGRANT\s+TEMP\s+ON\s+DATABASE\b/i.test(text)) {
    findings.push(
      finding(
        file,
        line,
        'TEMP database privilege enables temporary-table shadowing and must not be granted',
      ),
    );
  }

  if (/\bGRANT\s+(?:"eventpulse_app"|eventpulse_app)\s+TO\b/i.test(text)) {
    findings.push(
      finding(
        file,
        line,
        'Granting the runtime group role to another role can escalate privileges',
      ),
    );
  }

  for (const match of text.matchAll(
    /\bALTER\s+ROLE\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))[\s\S]*?\b(SUPERUSER|LOGIN|CREATEDB|CREATEROLE|REPLICATION|BYPASSRLS|PASSWORD)\b/gi,
  )) {
    const name = match[1] ?? normalizeIdentifier(match[2] ?? '');
    const attribute = match[3] ?? 'attribute';
    findings.push(
      finding(
        file,
        line,
        `Role ${name} receives dangerous attribute ${attribute}; privileged or login roles must be provisioned outside migrations`,
      ),
    );
  }

  if (/\bALTER\s+TABLE\b[\s\S]*?\bOWNER\s+TO\b/i.test(text)) {
    findings.push(
      finding(
        file,
        line,
        'ALTER TABLE OWNER TO changes table ownership and requires manual review',
      ),
    );
  }

  if (
    /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(?:"organization_id"|organization_id)\b/i.test(
      text,
    )
  ) {
    findings.push(
      finding(file, line, 'organization_id is dropped; tenant isolation would be lost'),
    );
  }

  if (
    /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+(?:COLUMN\s+)?(?:"organization_id"|organization_id)\s+TO\b/i.test(
      text,
    )
  ) {
    findings.push(
      finding(file, line, 'organization_id is renamed; tenant isolation would be lost'),
    );
  }

  if (
    /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+(?:COLUMN\s+)?(?:"organization_id"|organization_id)\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(
      text,
    )
  ) {
    findings.push(
      finding(file, line, 'organization_id type is changed; tenant isolation would be lost'),
    );
  }

  if (
    /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+(?:COLUMN\s+)?(?:"organization_id"|organization_id)\s+DROP\s+NOT\s+NULL\b/i.test(
      text,
    )
  ) {
    findings.push(
      finding(file, line, 'organization_id becomes nullable; tenant isolation would be lost'),
    );
  }

  if (
    /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+(?:COLUMN\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+TO\s+(?:"organization_id"|organization_id\b)/i.test(
      text,
    )
  ) {
    findings.push(
      finding(
        file,
        line,
        'A column is renamed to organization_id; tenant isolation column identity must stay stable',
      ),
    );
  }

  if (
    /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+(?:COLUMN\s+)?(?:"organization_id"|organization_id)\s+SET\s+DEFAULT\b/i.test(
      text,
    )
  ) {
    findings.push(
      finding(
        file,
        line,
        'organization_id receives a default value; tenant isolation must never be guessed',
      ),
    );
  }

  if (/\bUPDATE\b[\s\S]*?\bSET\b[\s\S]*?(?:"organization_id"|organization_id)\s*=/i.test(text)) {
    findings.push(
      finding(
        file,
        line,
        'A data migration updates organization_id; tenant reassignment requires manual review',
      ),
    );
  }

  if (/\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b[\s\S]*?\bCASCADE\b/i.test(text)) {
    findings.push(
      finding(
        file,
        line,
        'DROP COLUMN CASCADE can remove dependent constraints and requires manual review',
      ),
    );
  }

  if (/\bSET\s+(?:LOCAL\s+|SESSION\s+)?session_replication_role\s*(?:=|\bTO\b)/i.test(text)) {
    findings.push(
      finding(
        file,
        line,
        'session_replication_role cannot be changed; it would bypass integrity triggers',
      ),
    );
  }

  if (
    /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i.test(statement.raw) &&
    /\bAS\s+(?:E)?'/i.test(statement.raw)
  ) {
    findings.push(
      finding(
        file,
        line,
        'Function body is a string literal; the migration guard cannot analyze it',
      ),
    );
  }

  for (const candidate of UNSUPPORTED_PATTERNS) {
    if (candidate.pattern.test(text)) {
      findings.push(finding(file, line, candidate.message));
    }
  }

  return findings;
}

function analyzeSql(
  file: string,
  sql: string,
  lineOffset: number,
  allowDirectives: boolean,
  depth: number,
): MigrationFinding[] {
  if (depth > 2) {
    return [
      finding(file, lineOffset + 1, 'Nested executable bodies are too deep to analyze safely'),
    ];
  }

  const lexed = scanSql(sql);
  const lines = sql.split(/\r?\n/);
  const findings: MigrationFinding[] = [];

  for (const error of lexed.errors) {
    findings.push(finding(file, lineOffset + error.line, error.message));
  }

  findings.push(
    ...attachDirectives(
      file,
      lines,
      lexed.statements,
      lexed.directives,
      allowDirectives,
      lineOffset,
    ),
  );

  for (const statement of lexed.statements) {
    findings.push(...analyzeStatement(file, statement, lineOffset));
  }

  findings.push(...unusedDirectiveFindings(file, lexed.statements, lineOffset));

  for (const body of lexed.dollarBodies) {
    const owner = lexed.statements.find(
      (statement) => statement.startLine <= body.startLine && statement.endLine >= body.startLine,
    );

    if (owner === undefined) {
      continue;
    }

    if (
      !/^\s*(?:DO|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+PROCEDURE)\b/i.test(
        owner.sanitized,
      )
    ) {
      continue;
    }

    findings.push(
      ...analyzeSql(file, body.text, lineOffset + body.startLine - 1, false, depth + 1),
    );
  }

  return findings;
}

export function analyzeMigrationSql(files: readonly MigrationFile[]): MigrationFinding[] {
  const findings: MigrationFinding[] = [];

  for (const file of files) {
    findings.push(...analyzeSql(file.path, file.sql, 0, true, 0));
  }

  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.message.localeCompare(right.message),
  );
}

export async function analyzeMigrationDirectory(directory: string): Promise<MigrationFinding[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const files: MigrationFile[] = [];
  const findings: MigrationFinding[] = [];

  for (const name of directories) {
    const relativePath = join(name, 'migration.sql');

    try {
      const sql = await readFile(join(directory, relativePath), 'utf8');
      files.push({ path: relativePath, sql });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }

      findings.push(
        finding(
          relativePath,
          1,
          'Incomplete migration directory: migration.sql is missing and cannot be audited',
        ),
      );
    }
  }

  findings.push(...analyzeMigrationSql(files));

  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.message.localeCompare(right.message),
  );
}
