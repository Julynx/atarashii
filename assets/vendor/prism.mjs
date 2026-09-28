/**
 * @module prism
 * Standalone, zero-dependency syntax highlighting engine supporting Markdown and CSS grammars.
 */

/**
 * Represents a syntax-highlighted lexical token.
 */
export class Token {
  /**
   * Initializes a new token instance.
   * @param {string} type - Token categorization type.
   * @param {string | Token | Array<string | Token>} content - Nested text or sub-tokens.
   * @param {string | string[]} [alias] - Optional token alias for styling.
   * @param {string} [matchedString=""] - Raw matched string.
   */
  constructor(type, content, alias, matchedString = "") {
    this.type = type;
    this.content = content;
    this.alias = alias;
    this.length = (matchedString || "").length | 0;
  }
}

/**
 * Escapes special HTML characters in text.
 * @param {string} rawText - Unescaped string.
 * @returns {string} Escaped HTML string.
 */
export function escapeHtml(rawText) {
  return rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Linked list node for high-performance token stream splicing.
 */
class LinkedListNode {
  /**
   * Initializes a list node.
   * @param {string | Token} value - Node payload.
   */
  constructor(value) {
    this.value = value;
    this.previous = null;
    this.next = null;
  }
}

/**
 * Doubly-linked list for linear token stream modifications.
 */
class TokenLinkedList {
  /**
   * Initializes an empty linked list.
   */
  constructor() {
    this.head = new LinkedListNode(null);
    this.tail = new LinkedListNode(null);
    this.head.next = this.tail;
    this.tail.previous = this.head;
    this.length = 0;
  }

  /**
   * Inserts a new node immediately after the reference node.
   * @param {LinkedListNode} referenceNode - Insertion anchor.
   * @param {string | Token} value - Item to insert.
   * @returns {LinkedListNode} Created list node.
   */
  insertAfter(referenceNode, value) {
    const freshNode = new LinkedListNode(value);
    freshNode.previous = referenceNode;
    freshNode.next = referenceNode.next;
    referenceNode.next.previous = freshNode;
    referenceNode.next = freshNode;
    this.length += 1;
    return freshNode;
  }

  /**
   * Removes a node from the linked list.
   * @param {LinkedListNode} targetNode - Node to unlink.
   * @returns {void}
   */
  remove(targetNode) {
    targetNode.previous.next = targetNode.next;
    targetNode.next.previous = targetNode.previous;
    this.length -= 1;
  }

  /**
   * Converts the linked list into a standard Array.
   * @returns {Array<string | Token>} Flat array of tokens and strings.
   */
  toArray() {
    const items = [];
    let currentNode = this.head.next;
    while (currentNode !== this.tail) {
      items.push(currentNode.value);
      currentNode = currentNode.next;
    }
    return items;
  }
}

/**
 * Performs token matching against a linked list of text fragments.
 * @param {TokenLinkedList} tokenList - Target linked list.
 * @param {object} grammar - Language grammar definition.
 * @returns {void}
 */
function matchGrammar(tokenList, grammar) {
  for (const tokenType of Object.keys(grammar)) {
    const patternDefinition = grammar[tokenType];
    const patterns = Array.isArray(patternDefinition)
      ? patternDefinition
      : [patternDefinition];

    for (let patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
      const entry = patterns[patternIndex];
      const regularExpression = entry.pattern || entry;
      const lookbehind = Boolean(entry.lookbehind);
      const greedy = Boolean(entry.greedy);
      const lookbehindLength = entry.lookbehindLength || 0;
      const alias = entry.alias;
      const insideGrammar = entry.inside;

      const effectiveRegex = new RegExp(
        regularExpression.source,
        regularExpression.flags.includes("g")
          ? regularExpression.flags
          : `${regularExpression.flags}g`
      );

      let currentNode = tokenList.head.next;
      while (currentNode !== tokenList.tail) {
        if (typeof currentNode.value !== "string") {
          currentNode = currentNode.next;
          continue;
        }

        const stringValue = currentNode.value;
        effectiveRegex.lastIndex = 0;
        const matchResult = effectiveRegex.exec(stringValue);

        if (!matchResult) {
          currentNode = currentNode.next;
          continue;
        }

        let matchIndex = matchResult.index;
        let matchedString = matchResult[0];

        if (lookbehind && matchResult[1]) {
          const lookbehindShift = matchResult[1].length;
          matchIndex += lookbehindShift;
          matchedString = matchedString.slice(lookbehindShift);
        }

        if (matchedString.length === 0) {
          currentNode = currentNode.next;
          continue;
        }

        const prefixString = stringValue.slice(0, matchIndex);
        const suffixString = stringValue.slice(matchIndex + matchedString.length);

        let insertionPoint = currentNode.previous;
        tokenList.remove(currentNode);

        if (prefixString.length > 0) {
          insertionPoint = tokenList.insertAfter(insertionPoint, prefixString);
        }

        const tokenContent =
          typeof insideGrammar === "function"
            ? insideGrammar(matchedString)
            : insideGrammar
              ? tokenize(matchedString, insideGrammar)
              : matchedString;

        const createdToken = new Token(
          tokenType,
          tokenContent,
          alias,
          matchedString
        );

        insertionPoint = tokenList.insertAfter(insertionPoint, createdToken);

        if (suffixString.length > 0) {
          tokenList.insertAfter(insertionPoint, suffixString);
        }

        currentNode = insertionPoint.next;
      }
    }
  }
}

/**
 * Tokenizes source code into an array of strings and tokens.
 * @param {string} sourceCode - Raw code string.
 * @param {object} grammar - Language grammar configuration.
 * @returns {Array<string | Token>} Tokenized code items.
 */
export function tokenize(sourceCode, grammar) {
  if (!sourceCode) {
    return [];
  }

  const tokenList = new TokenLinkedList();
  tokenList.insertAfter(tokenList.head, sourceCode);
  matchGrammar(tokenList, grammar);
  return tokenList.toArray();
}

/**
 * Serializes tokens into syntax-highlighted HTML markup.
 * @param {string | Token | Array<string | Token>} tokenStream - Token or token list.
 * @param {string} [languageIdentifier=""] - Active language name.
 * @returns {string} Formatted HTML string.
 */
export function stringify(tokenStream, languageIdentifier = "") {
  if (typeof tokenStream === "string") {
    return escapeHtml(tokenStream);
  }

  if (Array.isArray(tokenStream)) {
    return tokenStream
      .map((item) => stringify(item, languageIdentifier))
      .join("");
  }

  const tokenClassNames = ["token", tokenStream.type];
  if (tokenStream.alias) {
    if (Array.isArray(tokenStream.alias)) {
      tokenClassNames.push(...tokenStream.alias);
    } else {
      tokenClassNames.push(tokenStream.alias);
    }
  }

  const innerHtml = stringify(tokenStream.content, languageIdentifier);
  return `<span class="${tokenClassNames.join(" ")}">${innerHtml}</span>`;
}

/**
 * Highlights a code string using the specified grammar.
 * @param {string} sourceCode - Raw source code.
 * @param {object} grammar - Target language grammar.
 * @param {string} [languageIdentifier=""] - Language identifier.
 * @returns {string} Syntax-highlighted HTML string.
 */
export function highlight(sourceCode, grammar, languageIdentifier = "") {
  const tokens = tokenize(sourceCode, grammar);
  return stringify(tokens, languageIdentifier);
}

const languageAliases = {
  py: "python",
  python: "python",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  json: "json",
  html: "html",
  xml: "html",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  css: "css",
};

/**
 * Parses fenced code block syntax and delegates content tokenization to target language.
 * @param {string} matchedBlock - Complete fenced code block string.
 * @returns {Array<string | Token>} Tokenized code block content.
 */
function parseCodeBlockContent(matchedBlock) {
  const codeBlockMatch = matchedBlock.match(
    /^([ \t]{0,3}`{3,})[ \t]*([a-zA-Z0-9_+\-]*)[ \t]*(\r?\n)?([\s\S]*?)(?:(\r?\n)?([ \t]{0,3}`{3,})[ \t]*$|$)/
  );

  if (!codeBlockMatch) {
    return [matchedBlock];
  }

  const openingFence = codeBlockMatch[1];
  const rawLanguage = (codeBlockMatch[2] || "").trim().toLowerCase();
  const leadingNewline = codeBlockMatch[3] || "";
  const codeContent = codeBlockMatch[4];
  const trailingNewline = codeBlockMatch[5] || "";
  const closingFence = codeBlockMatch[6] || "";

  const tokens = [];
  tokens.push(new Token("punctuation", openingFence));

  if (rawLanguage) {
    tokens.push(new Token("language-tag", rawLanguage));
  }

  if (leadingNewline) {
    tokens.push(leadingNewline);
  }

  const resolvedLanguage = languageAliases[rawLanguage] || rawLanguage;
  const targetGrammar = Prism.languages[resolvedLanguage];

  if (codeContent) {
    if (targetGrammar) {
      const nestedTokens = tokenize(codeContent, targetGrammar);
      tokens.push(...nestedTokens);
    } else {
      tokens.push(codeContent);
    }
  }

  if (trailingNewline) {
    tokens.push(trailingNewline);
  }

  if (closingFence) {
    tokens.push(new Token("punctuation", closingFence));
  }

  return tokens;
}

const cssGrammar = {
  comment: {
    pattern: /\/\*[\s\S]*?\*\//,
  },
  atrule: {
    pattern: /@[\w-]+[^{};]*?(?:;|(?=\s*\{))/,
    inside: {
      rule: /^@[\w-]+/,
      punctuation: /[:;]/,
    },
  },
  url: {
    pattern: /\burl\((?:(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1|[^)]*)\)/i,
    inside: {
      function: /^url/i,
      punctuation: /^\(|\)$/,
    },
  },
  selector: {
    pattern: /[^{}\s][^{};]*?(?=\s*\{)/,
    inside: {
      pseudo: /::?[a-zA-Z0-9_-]+/,
      attribute: /\[[^\]]+\]/,
      punctuation: /[,\s>+~]/,
    },
  },
  string: {
    pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
  },
  property: {
    pattern: /(?:^|\b)[a-zA-Z0-9_-]+(?=\s*:)/,
  },
  important: {
    pattern: /!important\b/i,
  },
  function: {
    pattern: /(?:^|\b)[a-zA-Z0-9_-]+(?=\()/,
  },
  number: {
    pattern: /(?:\b\d+(?:\.\d+)?|\B\.\d+)(?:px|em|rem|%|vh|vw|vmin|vmax|pt|pc|in|cm|mm|deg|rad|turn|s|ms|ch|fr)?\b/i,
  },
  punctuation: {
    pattern: /[{}();:,]/,
  },
};

const pythonGrammar = {
  comment: {
    pattern: /#.*/,
  },
  "string-triple": {
    pattern: /(?:[bruf]*)("""[\s\S]*?"""|'''[\s\S]*?''')/i,
  },
  string: {
    pattern: /(?:[bruf]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/i,
  },
  decorator: {
    pattern: /@[\w.]+/,
  },
  keyword: {
    pattern: /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|exec|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|print|raise|return|try|while|with|yield)\b/,
  },
  builtin: {
    pattern: /\b(?:__import__|abs|all|any|apply|ascii|basestring|bin|bool|buffer|bytearray|bytes|callable|chr|classmethod|cmp|coerce|compile|complex|delattr|dict|dir|divmod|enumerate|eval|execfile|file|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|intern|isinstance|issubclass|iter|len|list|locals|long|map|max|memoryview|min|next|object|oct|open|ord|pow|property|range|raw_input|reduce|reload|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|unichr|unicode|vars|xrange|zip)\b/,
  },
  boolean: {
    pattern: /\b(?:True|False|None)\b/,
  },
  function: {
    pattern: /\b[a-zA-Z_]\w*(?=\s*\()/,
  },
  number: {
    pattern: /(?:\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b0[xX][0-9a-fA-F]+\b|\b0[bB][01]+\b|\b0[oO][0-7]+\b)/,
  },
  operator: {
    pattern: /[-+%=]=?|!=|\*\*?=?|\/\/?=?|<[<=>]?|>[=>]?|[&|^~]/,
  },
  punctuation: {
    pattern: /[{}()[\]:;,.]/,
  },
};

const javascriptGrammar = {
  comment: {
    pattern: /\/\*[\s\S]*?\*\/|\/\/.*/,
  },
  "template-string": {
    pattern: /`(?:\\[\s\S]|\${(?:[^{}]|{[^}]*})*}|(?!\`)[^\\\`])*`/,
  },
  string: {
    pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
  },
  keyword: {
    pattern: /\b(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
  },
  boolean: {
    pattern: /\b(?:true|false)\b/,
  },
  function: {
    pattern: /\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()/,
  },
  number: {
    pattern: /(?:\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b0[xX][0-9a-fA-F]+\b|\b0[bB][01]+\b|\b0[oO][0-7]+\b)/,
  },
  operator: {
    pattern: /--|\+\+|&&|\|\||=>|===?|!==?|<=|>=|[-+*/%&|^!=<>?:]/,
  },
  punctuation: {
    pattern: /[{}()[\];,\.]/,
  },
};

const jsonGrammar = {
  property: {
    pattern: /"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,
  },
  string: {
    pattern: /"(?:\\.|[^\\"\r\n])*"/,
  },
  number: {
    pattern: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/,
  },
  boolean: {
    pattern: /\b(?:true|false)\b/,
  },
  null: {
    pattern: /\bnull\b/,
  },
  punctuation: {
    pattern: /[{}[\],:]/,
  },
};

const htmlGrammar = {
  comment: {
    pattern: /<!--[\s\S]*?-->/,
  },
  tag: {
    pattern: /<\/?[a-zA-Z0-9:-]+(?:\s+[a-zA-Z0-9_:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">]+))?)*\s*\/?>/,
    inside: {
      punctuation: /^<\/?|\/?>$/,
      "attr-value": {
        pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">]+)/,
        inside: {
          punctuation: /^=/,
          string: /(["'])[\s\S]*?\1/,
        },
      },
      "attr-name": /[a-zA-Z0-9_:-]+/,
    },
  },
  entity: /&[#a-zA-Z0-9]+;/,
};

const bashGrammar = {
  comment: {
    pattern: /(^|[\s])#.*/,
    lookbehind: true,
  },
  string: {
    pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
  },
  variable: {
    pattern: /\$[a-zA-Z_0-9]+|\$\{[^}]+\}/,
  },
  keyword: {
    pattern: /\b(?:if|then|else|elif|fi|for|while|in|do|done|case|esac|function|return|exit)\b/,
  },
  builtin: {
    pattern: /\b(?:echo|cd|pwd|ls|cat|mkdir|rm|cp|mv|chmod|chown|grep|sed|awk|curl|wget|npm|node|git|uv|python|pip)\b/,
  },
  operator: {
    pattern: /&&|\|\||>>|>|<|\||;/,
  },
  punctuation: {
    pattern: /[{}()[\]]/,
  },
};

const markdownGrammar = {
  "code-block": {
    pattern: /(^[ \t]{0,3}`{3,}[ \t]*[a-zA-Z0-9_+\-]*[ \t]*(?:\r?\n|$)(?:[\s\S]*?^[ \t]{0,3}`{3,}[ \t]*$|[\s\S]*$))/m,
    inside: parseCodeBlockContent,
  },
  "code-inline": {
    pattern: /(`+)(?:(?!\1)[^\r\n])+\1/,
    inside: {
      punctuation: /^`+|`+$/,
    },
  },
  heading: {
    pattern: /(^|[^\\])(#{1,6})[ \t].*$/m,
    lookbehind: true,
    inside: {
      punctuation: /^#{1,6}/,
    },
  },
  blockquote: {
    pattern: /(^|[^\\])(>[ \t].*)$/m,
    lookbehind: true,
    inside: {
      punctuation: /^>/,
    },
  },
  "horizontal-rule": {
    pattern: /(^[ \t]*)(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/m,
    lookbehind: true,
  },
  "task-list": {
    pattern: /(^[ \t]*)(?:[*+-]|\d+\.)[ \t]+\[[ xX]\][ \t]/m,
    lookbehind: true,
    inside: {
      punctuation: /^[*+-]|\d+\.|\[|\]/g,
      checked: /[xX]/,
    },
  },
  list: {
    pattern: /(^[ \t]*)(?:[*+-]|\d+\.)[ \t]/m,
    lookbehind: true,
    inside: {
      punctuation: /^[*+-]|\d+\./,
    },
  },
  bold: {
    pattern: /(^|[^\\])(\*\*|__)(?:(?!\2)[^\r\n])+\2/,
    lookbehind: true,
    inside: {
      punctuation: /^\*\*|^__|\*\*$|__$/,
    },
  },
  italic: {
    pattern: /(^|[^\\])([*_])(?:(?!\2)[^\r\n])+\2/,
    lookbehind: true,
    inside: {
      punctuation: /^[*_]|[*_]$/,
    },
  },
  link: {
    pattern: /\[[^\]]+\]\([^)]+\)/,
    inside: {
      content: {
        pattern: /(^\[)[^\]]+(?=\])/,
        lookbehind: true,
      },
      url: {
        pattern: /(^\()[^)]+(?=\))/,
        lookbehind: true,
      },
      punctuation: /[\[\]()]/,
    },
  },
  math: {
    pattern: /(^|[^\\])(?:\$\$[\s\S]+?\$\$|\$[^\$\r\n]+?\$)/,
    lookbehind: true,
    inside: {
      punctuation: /^\$\$?|\$\$?$/,
    },
  },
  punctuation: {
    pattern: /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/,
  },
};

export const Prism = {
  Token,
  escapeHtml,
  tokenize,
  stringify,
  highlight,
  languages: {
    css: cssGrammar,
    markdown: markdownGrammar,
    python: pythonGrammar,
    javascript: javascriptGrammar,
    typescript: javascriptGrammar,
    json: jsonGrammar,
    html: htmlGrammar,
    xml: htmlGrammar,
    bash: bashGrammar,
  },
};

export default Prism;
