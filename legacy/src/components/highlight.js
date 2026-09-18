/**
 * RedGet — syntax highlighting.
 *
 * A small, dependency-free tokenizer. For each language we keep an ordered list of
 * token rules (regex with a leading capture group naming the token type). The input
 * is scanned left to right; every matched slice is wrapped in
 * <span class="tok-…"> with its text HTML-escaped, so highlighting can never break
 * markup or inject content.
 *
 * Supported: javascript, typescript, jsx, tsx, json, css, scss, html/xml/svg,
 * markdown, yaml, bash/shell, sql, go, rust, python, ruby, java, c, cpp, csharp,
 * php, dockerfile, ini/toml, graphql, diff, plain text.
 */

import { h } from '../core/dom.js';
import { escapeHtml } from '../core/util.js';

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx', mts: 'typescript', cts: 'typescript',
  json: 'json', jsonc: 'json', json5: 'json',
  css: 'css', scss: 'scss', less: 'css', sass: 'scss',
  html: 'html', htm: 'html', xhtml: 'html', svg: 'html', xml: 'html', vue: 'html', svelte: 'html',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  yml: 'yaml', yaml: 'yaml',
  sh: 'bash', bash: 'bash', zsh: 'bash', shell: 'bash', ksh: 'bash',
  sql: 'sql', psql: 'sql',
  go: 'go', rs: 'rust', py: 'python', python: 'python', pyi: 'python',
  rb: 'ruby', gemspec: 'ruby', rake: 'ruby',
  java: 'java', kt: 'java', kts: 'java', scala: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', php: 'php', dockerfile: 'dockerfile',
  toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini', properties: 'ini',
  graphql: 'graphql', gql: 'graphql',
  diff: 'diff', patch: 'diff',
  makefile: 'bash', mk: 'bash',
  txt: 'text', text: 'text', log: 'text',
  gitignore: 'ini', editorconfig: 'ini',
};

const NAME_LANG = {
  javascript: 'javascript', js: 'javascript', node: 'javascript',
  typescript: 'typescript', ts: 'typescript',
  jsx: 'jsx', tsx: 'tsx', react: 'jsx',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  css: 'css', scss: 'scss', html: 'html', xml: 'html', svg: 'html',
  markdown: 'markdown', md: 'markdown', bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash',
  sql: 'sql', go: 'go', rust: 'rust', python: 'python', ruby: 'ruby', java: 'java',
  c: 'c', 'c++': 'cpp', cpp: 'cpp', csharp: 'csharp', 'c#': 'csharp', php: 'php',
  dockerfile: 'dockerfile', toml: 'ini', ini: 'ini', graphql: 'graphql', diff: 'diff',
  text: 'text', plain: 'text', plaintext: 'text',
};

export function languageForPath(path) {
  const name = String(path || '').split('/').pop() || '';
  const lower = name.toLowerCase();
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile';
  if (lower === 'makefile' || lower === 'gnumakefile') return 'bash';
  if (lower === '.gitignore' || lower === '.dockerignore' || lower === '.npmignore') return 'ini';
  if (lower === '.editorconfig') return 'ini';
  if (lower === 'codeowners') return 'ini';
  if (lower === 'gemfile' || lower === 'rakefile') return 'ruby';
  if (lower === 'cargo.toml' || lower.endsWith('.toml')) return 'ini';
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return 'text';
  const ext = lower.slice(dot + 1);
  return EXT_LANG[ext] || 'text';
}

export function normalizeLanguage(lang) {
  const key = String(lang || '').toLowerCase().trim();
  return NAME_LANG[key] || (EXT_LANG[key] || null) || 'text';
}

/* --------------------------------------------------------------------------
   Token rules. Each entry: [tokenType, regex]. Regexes must be sticky-safe:
   we always anchor with a fresh lastIndex, so use non-global patterns and
   rely on the scanner to advance.
   -------------------------------------------------------------------------- */

function re(pattern, flags = 'y') {
  return new RegExp(pattern, flags);
}

const JS_KEYWORDS = 'as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|readonly|return|satisfies|set|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield';
const JS_CONSTANTS = 'true|false|null|undefined|NaN|Infinity';
const PY_KEYWORDS = 'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|match|case';
const GO_KEYWORDS = 'break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var';
const RUST_KEYWORDS = 'as|async|await|break|const|continue|crate|dyn|else|enum|extern|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|type|unsafe|use|where|while|yield';
const RUBY_KEYWORDS = 'alias|and|begin|break|case|class|def|defined?|do|else|elsif|end|ensure|false|for|if|in|module|next|nil|not|or|redo|require|require_relative|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|yield|attr_accessor|attr_reader|attr_writer';
const JAVA_KEYWORDS = 'abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|record|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|var|void|volatile|while|yield';
const C_KEYWORDS = 'auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|bool|true|false|NULL';
const CPP_KEYWORDS = `${C_KEYWORDS}|class|namespace|template|typename|public|private|protected|virtual|override|final|new|delete|this|using|constexpr|decltype|noexcept|static_assert|thread_local|co_await|co_return|co_yield|auto`;
const CS_KEYWORDS = 'abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|record|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|var|virtual|void|volatile|while|async|await|yield|dynamic|nameof|when';
const SQL_KEYWORDS = 'select|from|where|insert|into|values|update|set|delete|create|alter|drop|table|view|index|database|schema|join|inner|left|right|full|outer|cross|on|group|by|order|having|limit|offset|distinct|as|and|or|not|null|is|in|exists|between|like|case|when|then|else|end|union|all|with|recursive|primary|key|foreign|references|constraint|default|check|unique|auto_increment|serial|identity|if|begin|commit|rollback|transaction|grant|revoke|cast|coalesce|count|sum|avg|min|max|asc|desc|ilike|returning|trigger|function|procedure|declare|cursor|fetch|partition|over|window|rows|range|unbounded|preceding|following|current|row';
const SQL_TYPES = 'int|integer|bigint|smallint|tinyint|decimal|numeric|float|double|real|char|varchar|text|boolean|bool|date|time|timestamp|timestamptz|interval|uuid|json|jsonb|bytea|serial|enum|blob|clob';

/** Comment/string patterns shared by C-like languages. */
const CLIKE_COMMON = [
  ['comment', re('(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)|#[^\\n]*)')],
  ['string', re('(?:`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\\\n])*"?|\'(?:\\\\.|[^\'\\\\\\n])*\'?)')],
  ['regex', re('\\/(?![*\\/])(?:\\\\.|\\[(?:\\\\.|[^\\]\\\\])*\\]|[^\\/\\\\\\n])+\\/[gimsuy]*(?=[\\s),;:=!&|?\\]}]|$)')],
];

const LANG_RULES = {
  javascript: [
    ...CLIKE_COMMON,
    ['number', re('0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?n?')],
    ['keyword', re(`\\b(?:${JS_KEYWORDS})\\b`)],
    ['constant', re(`\\b(?:${JS_CONSTANTS})\\b`)],
    ['type', re('\\b[A-Z][A-Za-z0-9_$]*\\b')],
    ['function', re('\\b[A-Za-z_$][\\w$]*(?=\\s*\\()')],
    ['variable', re('\\b[A-Za-z_$][\\w$]*\\b')],
    ['property', re('(?<=\\.)[A-Za-z_$][\\w$]*')],
    ['operator', re('=>|\\.\\.\\.|[+\\-*/%<>=!&|^~?:]+')],
    ['punct', re('[{}()[\\];,.]')],
  ],
  jsx: null, // filled below
  typescript: null,
  tsx: null,
  python: [
    ['comment', re('#[^\\n]*')],
    ['string', re('(?:[rbuf]{0,2})?(?:"""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$)|"(?:\\\\.|[^"\\\\\\n])*"?|\'(?:\\\\.|[^\'\\\\\\n])*\'?)', 'i')],
    ['number', re('\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[jJ]?\\b')],
    ['keyword', re(`\\b(?:${PY_KEYWORDS})\\b`)],
    ['constant', re('\\b(?:True|False|None|NotImplemented|Ellipsis|__name__|__file__|__all__|self|cls)\\b')],
    ['function', re('(?<=def\\s)\\w+|\\b[A-Za-z_]\\w*(?=\\s*\\()')],
    ['type', re('\\b[A-Z][A-Za-z0-9_]*\\b')],
    ['variable', re('@\\w+|\\b[A-Za-z_]\\w*\\b')],
    ['operator', re('\\*\\*|\\/\\/|[+\\-*/%<>=!&|^~@:]+')],
    ['punct', re('[{}()[\\];,.]')],
  ],
  bash: [
    ['comment', re('#[^\\n]*')],
    ['string', re('(?:"(?:\\\\.|[^"\\\\])*"?|\'[^\']*\'?)')],
    ['variable', re('\\$(?:\\{[^}]*\\}|\\([^)]*\\)|[A-Za-z_][\\w]*|[0-9@#?$!*-])')],
    ['keyword', re('\\b(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|function|in|select|time|return|exit|break|continue|local|export|readonly|declare|typeset|unset|shift|trap|eval|exec|source|alias)\\b')],
    ['function', re('(?<=^|\\s)(?:sudo|git|npm|npx|pnpm|yarn|node|python3?|pip3?|docker|kubectl|curl|wget|grep|sed|awk|cat|echo|ls|cd|mkdir|rm|cp|mv|chmod|chown|make|cargo|go|brew|apt|apt-get|dnf|yum|systemctl|ssh|scp|tar|gzip|find|xargs|sort|uniq|head|tail|wc|test|true|false)(?=\\s|$)')],
    ['number', re('\\b\\d+(?:\\.\\d+)?\\b')],
    ['operator', re('\\|\\||&&|[|&<>=!+\\-*/]+')],
    ['punct', re('[{}()\\[\\];,.]')],
  ],
  json: [
    ['property', re('"(?:\\\\.|[^"\\\\])*"(?=\\s*:)')],
    ['string', re('"(?:\\\\.|[^"\\\\])*"?')],
    ['number', re('-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b')],
    ['constant', re('\\b(?:true|false|null)\\b')],
    ['punct', re('[{}[\\],:]')],
  ],
  yaml: [
    ['comment', re('#[^\\n]*')],
    ['property', re('^[ \\t-]*(?:- )?[A-Za-z0-9_.$/-]+(?=\\s*:(?:\\s|$))', 'm')],
    ['string', re('(?:"(?:\\\\.|[^"\\\\])*"|\'[^\']*\')')],
    ['keyword', re('\\b(?:true|false|null|yes|no|on|off|~)\\b')],
    ['number', re('\\b-?\\d+(?:\\.\\d+)?\\b')],
    ['variable', re('&\\w+|\\*\\w+|!!\\w+|<<')],
    ['punct', re('[:\\-[\\]{},>|]')],
  ],
  css: [
    ['comment', re('\\/\\*[\\s\\S]*?(?:\\*\\/|$)')],
    ['string', re('(?:"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')')],
    ['keyword', re('@(?:media|supports|import|keyframes|font-face|layer|container|property|charset|namespace|page|scope|starting-style|view-transition)(?=[\\s({;])')],
    ['variable', re('--[A-Za-z0-9_-]+')],
    ['selector', re('(?:^|[},\\s])(?:[.#][A-Za-z0-9_-]+|\\[[^\\]]*\\]|::?[a-z-]+|:hover|:focus-visible)(?=[\\s,{:.\\[])', 'm')],
    ['function', re('[a-zA-Z-]+(?=\\()')],
    ['property', re('(?:^|[{;\\s])\\s*(-?[a-z][a-z0-9-]*)(?=\\s*:)', 'mi')],
    ['number', re('\\b\\d*\\.?\\d+(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch|ex|pt|cm|mm|in|dpi)?\\b')],
    ['constant', re('\\b(?:inherit|initial|unset|revert|auto|none|normal|important|transparent|currentColor)\\b')],
    ['tag', re('\\b(?:html|body|div|span|a|p|ul|ol|li|table|tr|td|th|h[1-6]|section|header|footer|main|nav|aside|button|input|select|textarea|form|label|img|svg|code|pre|dialog|details|summary)(?=[\\s,{:.\\[])')],
    ['operator', re('[>~+*|=]')],
    ['punct', re('[{}();,:.]')],
  ],
  html: [
    ['comment', re('<!--[\\s\\S]*?(?:-->|$)')],
    ['string', re('(?:"[^"]*"?|\'[^\']*\'?)')],
    ['tag', re('<\\/?[A-Za-z][\\w:.-]*')],
    ['tag', re('\\/?>')],
    ['attr', re('\\b[A-Za-z_:][\\w:.-]*(?=\\s*=)')],
    ['keyword', re('\\b(?:!DOCTYPE|!doctype)\\b')],
    ['punct', re('[=]')],
  ],
  markdown: [
    ['comment', re('<!--[\\s\\S]*?(?:-->|$)')],
    ['heading', re('^#{1,6}[^\\n]*', 'm')],
    ['inserted', re('^\\s*\\+[^\\n]*', 'm')],
    ['deleted', re('^\\s*-[^\\n]*', 'm')],
    ['string', re('`[^`\\n]*`')],
    ['keyword', re('^\\s*(?:[-*+]|\\d+\\.)\\s', 'm')],
    ['strong', re('\\*\\*[^*\\n]+\\*\\*|__[^_\\n]+__')],
    ['emphasis', re('(?<![*\\w])\\*[^*\\n]+\\*(?![*\\w])|(?<![_\\w])_[^_\\n]+_(?![_\\w])')],
    ['link', re('!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)|!?\\[[^\\]\\n]*\\]\\[[^\\]\\n]*\\]|^\\s*\\[[^\\]\\n]+\\]:\\s*\\S+', 'm')],
    ['tag', re('^\\s*>[^\\n]*', 'm')],
    ['punct', re('(?<!\\n)---(?=\\n|$)|\\|')],
  ],
  sql: [
    ['comment', re('--[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)')],
    ['string', re('(?:\'(?:\'\'|[^"])*\'?|"(?:""|[^"])*"?|`[^`]*`?)')],
    ['keyword', re(`\\b(?:${SQL_KEYWORDS})\\b`, 'iy')],
    ['type', re(`\\b(?:${SQL_TYPES})\\b`, 'iy')],
    ['number', re('\\b\\d+(?:\\.\\d+)?\\b')],
    ['variable', re('\\$\\d+|:@?\\w+')],
    ['function', re('\\b\\w+(?=\\s*\\()')],
    ['operator', re('[<>=!]+|\\|\\||::')],
    ['punct', re('[(),;.*]')],
  ],
  go: [
    ['comment', re('(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))')],
    ['string', re('(?:`[^`]*`|"(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?)')],
    ['keyword', re(`\\b(?:${GO_KEYWORDS})\\b`)],
    ['type', re('\\b(?:bool|byte|complex64|complex128|error|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr|any)\\b|\\b[A-Z]\\w*\\b')],
    ['constant', re('\\b(?:true|false|iota|nil)\\b')],
    ['function', re('\\b\\w+(?=\\s*\\()')],
    ['number', re('\\b0[xX][0-9a-fA-F]+|\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b')],
    ['operator', re(':?=|<-|&&|\\|\\||[+\\-*/%<>=!&|^~]+')],
    ['punct', re('[{}()[\\];,.]')],
  ],
  rust: [
    ['comment', re('(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))')],
    ['string', re('(?:b?"(?:\\\\.|[^"\\\\])*"?|r#*"[\\s\\S]*?"#*|\'(?:\\\\.|[^\'\\\\])\'|b\'(?:\\\\.|[^\'\\\\])\'?)')],
    ['keyword', re(`\\b(?:${RUST_KEYWORDS})\\b`)],
    ['type', re('\\b(?:bool|char|f32|f64|i8|i16|i32|i64|i128|isize|str|u8|u16|u32|u64|u128|usize|String|Vec|Option|Result|Box|Rc|Arc|HashMap|HashSet)\\b|\\b[A-Z]\\w*\\b')],
    ['constant', re('\\b(?:true|false|None|Some|Ok|Err)\\b')],
    ['function', re('\\b\\w+(?=\\s*[(!])')],
    ['variable', re('\\b[a-z_]\\w*!?')],
    ['number', re('\\b0[xXob][0-9a-fA-F_]+|\\b\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?(?:f32|f64|i\\d+|u\\d+|isize|usize)?\\b')],
    ['operator', re('=>|::|\\?|&&|\\|\\||[+\\-*/%<>=!&|^~@]+')],
    ['punct', re('[{}()[\\];,.]')],
  ],
  ruby: [
    ['comment', re('#[^\\n]*|=begin[\\s\\S]*?(?:=end|$)')],
    ['string', re('(?::[A-Za-z_]\\w*[?!]?|"(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?|%[wWiI]?[([{<][^\\])}>]*[\\])}>]|`[^`]*`?)')],
    ['keyword', re(`\\b(?:${RUBY_KEYWORDS})\\b`)],
    ['constant', re('\\b[A-Z][A-Za-z0-9_]*\\b')],
    ['variable', re('[@$][@]?\\w+|\\b\\w+[?!](?=\\s|\\()')],
    ['function', re('\\b\\w+(?=\\s*[({]?\\s*(?:\\||\\w|\\s*$))')],
    ['number', re('\\b0[xX][0-9a-fA-F_]+|\\b\\d[\\d_]*(?:\\.\\d+)?\\b')],
    ['operator', re('<=>|=>|\\|\\||&&|[+\\-*/%<>=!&|^~]+')],
    ['punct', re('[{}()[\\];,.]')],
  ],
  java: [
    ['comment', re('(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))')],
    ['string', re('(?:"(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?|"""[\\s\\S]*?(""")?)')],
    ['keyword', re(`\\b(?:${JAVA_KEYWORDS})\\b`)],
    ['type', re('\\b(?:boolean|byte|char|double|float|int|long|short|void|String|Integer|Long|Double|List|Map|Set|Optional)\\b|\\b[A-Z]\\w*\\b')],
    ['constant', re('\\b(?:true|false|null)\\b')],
    ['variable', re('@\\w+')],
    ['function', re('\\b\\w+(?=\\s*\\()')],
    ['number', re('\\b\\d[\\d_]*(?:\\.\\d+)?[fFdDlL]?\\b')],
    ['operator', re('->|::|[+\\-*/%<>=!&|^~?:]+')],
    ['punct', re('[{}()[\\];,.]')],
  ],
  c: [
    ['comment', re('(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))')],
    ['string', re('(?:"(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?)')],
    ['keyword', re(`\\b(?:${C_KEYWORDS})\\b`)],
    ['variable', re('#\\s*(?:include|define|ifdef|ifndef|endif|pragma|if|else|elif|undef)\\b[^\n]*')],
    ['type', re('\\b(?:size_t|ssize_t|uint\\d+_t|int\\d+_t|FILE|void)\\b|\\b[A-Z][A-Z0-9_]{2,}\\b')],
    ['function', re('\\b\\w+(?=\\s*\\()')],
    ['number', re('\\b0[xX][0-9a-fA-F]+[uUlL]*|\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[fFuUlL]*\\b')],
    ['operator', re('->|[+\\-*/%<>=!&|^~?:]+')],
    ['punct', re('[{}()[\\];,.]')],
  ],
  csharp: [
    ['comment', re('(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))')],
    ['string', re('(?:@?"(?:\\\\.|[^"\\\\])*"?|\\$"(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?)')],
    ['keyword', re(`\\b(?:${CS_KEYWORDS})\\b`)],
    ['type', re('\\b(?:string|int|bool|double|float|decimal|object|var|Task|List|Dictionary)\\b|\\b[A-Z]\\w*\\b')],
    ['variable', re('\\b[A-Za-z_]\\w*(?=\\s*[.\\[({])')],
    ['function', re('\\b\\w+(?=\\s*\\()')],
    ['number', re('\\b\\d+(?:\\.\\d+)?[fFdDmMlLuU]*\\b')],
    ['operator', re('=>|\\?\\?|\\?\\.|[+\\-*/%<>=!&|^~?:]+')],
    ['punct', re('[{}()[\\];,.]')],
  ],
  php: [
    ['comment', re('(?:\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))')],
    ['string', re('(?:"(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?)')],
    ['keyword', re('\\b(?:abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|enum|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|or|print|private|protected|public|readonly|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\\b')],
    ['variable', re('\\$\\w+')],
    ['constant', re('\\b(?:true|false|null|TRUE|FALSE|NULL)\\b')],
    ['type', re('\\b[A-Z]\\w*\\b')],
    ['tag', re('<\\?php|\\?>')],
    ['function', re('\\b\\w+(?=\\s*\\()')],
    ['number', re('\\b\\d+(?:\\.\\d+)?\\b')],
    ['operator', re('=>|->|::|[+\\-*/%<>=!&|^~?:.@]+')],
    ['punct', re('[{}()[\\];,]')],
  ],
  dockerfile: [
    ['comment', re('#[^\\n]*')],
    ['keyword', re('^(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\\b', 'i')],
    ['string', re('(?:"(?:\\\\.|[^"\\\\])*"|\'[^\']*\')')],
    ['variable', re('\\$\\{?\\w+\\}?')],
    ['constant', re('\\b(?:AS|as)\\b')],
    ['number', re('\\b\\d+\\b')],
    ['operator', re('\\\\|&&|\\|\\||=')],
    ['punct', re('[\\[\\],]')],
  ],
  ini: [
    ['comment', re('(?:[;#][^\\n]*)')],
    ['keyword', re('^\\s*\\[[^\\]\\n]*\\]', 'm')],
    ['property', re('^\\s*[A-Za-z0-9_.${}/\\[\\]-]+(?=\\s*=)', 'm')],
    ['string', re('(?:"[^"]*"?|\'[^\']*\'?)')],
    ['constant', re('\\b(?:true|false|on|off|yes|no|null|none)\\b', 'i')],
    ['number', re('\\b\\d+(?:\\.\\d+)?\\b')],
    ['operator', re('=')],
  ],
  graphql: [
    ['comment', re('#[^\\n]*')],
    ['string', re('(?:"""[\\s\\S]*?"""|"(?:\\\\.|[^"\\\\])*"?)')],
    ['keyword', re('\\b(?:query|mutation|subscription|fragment|type|interface|union|enum|input|scalar|schema|directive|extend|implements|on|repeatable)\\b')],
    ['type', re('\\b[A-Z]\\w*\\b')],
    ['variable', re('\\$\\w+')],
    ['function', re('\\b\\w+(?=\\s*[(:])')],
    ['constant', re('\\b(?:true|false|null)\\b')],
    ['number', re('\\b\\d+(?:\\.\\d+)?\\b')],
    ['operator', re('\\.\\.\\.|[!=|&]|:')],
    ['punct', re('[{}()\\[\\],]')],
  ],
  diff: [
    ['inserted', re('^\\+[^\\n]*', 'm')],
    ['deleted', re('^-[^\\n]*', 'm')],
    ['keyword', re('^@@[^\\n]*', 'm')],
    ['comment', re('^(?:diff|index|---|\\+\\+\\+|new file|deleted file|similarity|rename|Binary)[^\\n]*', 'm')],
  ],
  text: [],
};

// JSX/TSX = JavaScript rules + tag handling; TypeScript = JavaScript + type keywords.
LANG_RULES.jsx = [
  ['comment', re('(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)|<!--[\\s\\S]*?(?:-->|$))')],
  ['string', re('(?:`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?)')],
  ['tag', re('<\\/?[A-Za-z][\\w.:-]*(?=[\\s/>])')],
  ['attr', re('\\b[A-Za-z_:][\\w:.-]*(?=\\s*=)')],
  ['number', re('\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b')],
  ['keyword', re(`\\b(?:${JS_KEYWORDS})\\b`)],
  ['constant', re(`\\b(?:${JS_CONSTANTS})\\b`)],
  ['type', re('\\b[A-Z][A-Za-z0-9_$]*\\b')],
  ['function', re('\\b[A-Za-z_$][\\w$]*(?=\\s*\\()')],
  ['variable', re('\\b[A-Za-z_$][\\w$]*\\b')],
  ['operator', re('=>|\\.\\.\\.|[+\\-*/%<>=!&|^~?:]+')],
  ['punct', re('[{}()[\\];,.]')],
];
LANG_RULES.typescript = [
  ...CLIKE_COMMON,
  ['number', re('\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?n?\\b')],
  ['keyword', re(`\\b(?:${JS_KEYWORDS}|abstract|declare|namespace|keyof|infer|is|asserts|out|override|accessor)\\b`)],
  ['constant', re(`\\b(?:${JS_CONSTANTS})\\b`)],
  ['type', re('\\b(?:string|number|boolean|any|unknown|never|void|object|symbol|bigint|Array|Promise|Record|Partial|Required|Readonly|Omit|Pick|Exclude|Extract|ReturnType)\\b|\\b[A-Z][A-Za-z0-9_$]*\\b')],
  ['function', re('\\b[A-Za-z_$][\\w$]*(?=\\s*[(<])')],
  ['variable', re('\\b[A-Za-z_$][\\w$]*\\b')],
  ['property', re('(?<=\\.)[A-Za-z_$][\\w$]*')],
  ['operator', re('=>|\\.\\.\\.|[+\\-*/%<>=!&|^~?:]+')],
  ['punct', re('[{}()[\\];,.]')],
];
LANG_RULES.tsx = LANG_RULES.typescript.concat([['tag', re('<\\/?[A-Za-z][\\w.:-]*(?=[\\s/>])')]]);
LANG_RULES.scss = LANG_RULES.css.concat([['variable', re('\\$[A-Za-z0-9_-]+')]]);

export function supportedLanguages() {
  return Object.keys(LANG_RULES);
}

/**
 * Highlight a single line (or whole source) into HTML.
 * Always returns escaped markup, never raw user text.
 */
export function highlight(code, lang = 'text') {
  const language = normalizeLanguage(lang);
  const rules = LANG_RULES[language];
  const source = String(code == null ? '' : code);
  if (!rules || rules.length === 0 || source.length === 0) return escapeHtml(source);

  let out = '';
  let index = 0;
  let guard = 0;
  const maxIterations = source.length * 8 + 64;

  while (index < source.length) {
    guard += 1;
    if (guard > maxIterations) { out += escapeHtml(source.slice(index)); break; }
    let matched = false;
    for (const rule of rules) {
      const [type, pattern] = rule;
      pattern.lastIndex = index;
      const result = pattern.exec(source);
      if (result && result.index === index && result[0].length > 0) {
        out += `<span class="tok-${type}">${escapeHtml(result[0])}</span>`;
        index += result[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += escapeHtml(source[index]);
      index += 1;
    }
  }
  return out;
}

/** Highlight a whole file, returning one HTML string per line (line array). */
export function highlightLines(code, lang = 'text') {
  const language = normalizeLanguage(lang);
  const source = String(code == null ? '' : code);
  if (language === 'text' || !LANG_RULES[language] || LANG_RULES[language].length === 0) {
    return source.split('\n').map((line) => escapeHtml(line));
  }
  // Highlight the full source once, then split on newlines. Because we only ever
  // wrap escaped text in <span>s that never span a newline except for multi-line
  // comments/strings, we re-close/re-open those spans per line.
  const html = highlight(source, language);
  const lines = html.split('\n');
  const openStack = [];
  return lines.map((line) => {
    let prefix = openStack.map((cls) => `<span class="${cls}">`).join('');
    const result = prefix + line;
    // Update the open-stack from unclosed tags in this line.
    const tagRe = /<span class="([^"]+)">|<\/span>/g;
    const stack = openStack.slice();
    let match = tagRe.exec(line);
    while (match !== null) {
      if (match[0] === '</span>') stack.pop();
      else stack.push(match[1]);
      match = tagRe.exec(line);
    }
    openStack.length = 0;
    stack.forEach((cls) => openStack.push(cls));
    const suffix = '</span>'.repeat(Math.max(0, stack.length));
    void prefix;
    return result + suffix;
  });
}

/** Line numbers + highlighted code as a <table class="blob-table"> (DOM). */
export function codeTable(code, lang = 'text', options = {}) {
  const { startLine = 1, highlightRange = null, onLineClick = null, wrap = false, showLineNumbers = true } = options;
  const lines = String(code == null ? '' : code).split('\n');
  const highlighted = highlightLines(lines.join('\n'), lang);

  const numbers = h('td', { class: 'blob-line-numbers', 'aria-hidden': 'true' });
  const codeCell = h('td', { class: 'blob-code' });

  highlighted.forEach((html, index) => {
    const lineNumber = startLine + index;
    const inRange = Array.isArray(highlightRange)
      && lineNumber >= highlightRange[0] && lineNumber <= highlightRange[1];
    const numEl = h('a', {
      class: ['blob-line-number', inRange ? 'is-highlighted' : ''].filter(Boolean).join(' '),
      href: `#L${lineNumber}`,
      id: `L${lineNumber}`,
      dataset: { line: String(lineNumber) },
      title: `Line ${lineNumber}`,
      onClick: (event) => {
        if (typeof onLineClick === 'function') { event.preventDefault(); onLineClick(lineNumber, event); }
      },
    }, String(lineNumber));
    numbers.appendChild(numEl);

    const lineEl = h('span', { class: ['blob-code-line', inRange ? 'is-target' : ''].filter(Boolean).join(' ') });
    lineEl.innerHTML = html === '' ? '&nbsp;' : html;
    codeCell.appendChild(lineEl);
  });

  return h('div', { class: 'blob-scroll', dataset: { wrap: String(Boolean(wrap)) } },
    h('table', { class: 'blob-table' },
      h('tbody', {},
        h('tr', {},
          showLineNumbers ? numbers : null,
          codeCell))));
}

/** Default export bundle. */
export default { highlight, highlightLines, codeTable, languageForPath, normalizeLanguage, supportedLanguages };
