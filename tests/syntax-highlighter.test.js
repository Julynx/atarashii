/**
 * @module syntax-highlighter-test
 * Unit and integration tests verifying Markdown and CSS tokenization, HTML escaping, and controller synchronization.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

describe("Prism Syntax Highlighting Engine", () => {
  it("tokenizes and highlights Markdown headings, emphasis, code, and links", async () => {
    const { Prism } = await import("../assets/vendor/prism.mjs");

    const sampleMarkdown = [
      "# Main Header",
      "## Secondary Header",
      "Paragraph with **bold text** and *italicized text*.",
      "> Inspirational quote block",
      "```css",
      "body { color: red; }",
      "```",
      "- Bullet item A",
      "1. Ordered item B",
      "- [x] Completed task",
      "- [ ] Incomplete task",
      "$e=mc^2$",
      "[Documentation](https://example.com)",
      "---",
    ].join("\n");

    const markup = Prism.highlight(
      sampleMarkdown,
      Prism.languages.markdown,
      "markdown"
    );

    assert.ok(markup.includes('class="token heading"'));
    assert.ok(markup.includes('class="token bold"'));
    assert.ok(markup.includes('class="token italic"'));
    assert.ok(markup.includes('class="token blockquote"'));
    assert.ok(markup.includes('class="token code-block"'));
    assert.ok(markup.includes('class="token list"'));
    assert.ok(markup.includes('class="token task-list"'));
    assert.ok(markup.includes('class="token checked"'));
    assert.ok(markup.includes('class="token math"'));
    assert.ok(markup.includes('class="token link"'));
    assert.ok(markup.includes('class="token horizontal-rule"'));
  });

  it("tokenizes and highlights CSS selectors, properties, values, and at-rules", async () => {
    const { Prism } = await import("../assets/vendor/prism.mjs");

    const sampleCss = [
      "/* Document stylesheet */",
      "@media (min-width: 768px) {",
      "  .container > h1 {",
      "    margin: 16px 0;",
      "    color: #ffffff;",
      "    background-color: rgb(16, 20, 31);",
      "    display: flex !important;",
      "  }",
      "}",
    ].join("\n");

    const markup = Prism.highlight(sampleCss, Prism.languages.css, "css");

    assert.ok(markup.includes('class="token comment"'));
    assert.ok(markup.includes('class="token atrule"'));
    assert.ok(markup.includes('class="token selector"'));
    assert.ok(markup.includes('class="token property"'));
    assert.ok(markup.includes('class="token number"'));
    assert.ok(markup.includes('class="token function"'));
    assert.ok(markup.includes('class="token important"'));
    assert.ok(markup.includes('class="token punctuation"'));
  });

  it("safely escapes HTML characters to prevent cross-site scripting vulnerabilities", async () => {
    const { Prism, escapeHtml } = await import("../assets/vendor/prism.mjs");

    const maliciousInput = '<script>alert("xss")</script> & <b>test</b>';
    const escaped = escapeHtml(maliciousInput);

    assert.equal(escaped.includes("<script>"), false);
    assert.ok(escaped.includes("&lt;script&gt;"));
    assert.ok(escaped.includes("&amp;"));
    assert.ok(escaped.includes("&quot;xss&quot;"));

    const highlightedMarkdown = Prism.highlight(
      maliciousInput,
      Prism.languages.markdown,
      "markdown"
    );
    assert.equal(highlightedMarkdown.includes("<script>"), false);
  });

  it("tokenizes language-annotated code blocks in Markdown for Python and JavaScript", async () => {
    const { Prism } = await import("../assets/vendor/prism.mjs");

    const fence = "```";
    const sampleWithPython = [
      "# Python Script",
      "",
      `${fence}python`,
      "def main():",
      "    pass",
      fence,
    ].join("\n");

    const pythonMarkup = Prism.highlight(
      sampleWithPython,
      Prism.languages.markdown,
      "markdown"
    );

    assert.ok(pythonMarkup.includes('class="token code-block"'));
    assert.ok(pythonMarkup.includes('class="token language-tag">python</span>'));
    assert.ok(pythonMarkup.includes('class="token keyword">def</span>'));
    assert.ok(pythonMarkup.includes('class="token function">main</span>'));
    assert.ok(pythonMarkup.includes('class="token keyword">pass</span>'));

    const sampleWithJs = [
      `${fence}javascript`,
      "const answer = 42;",
      fence,
    ].join("\n");

    const jsMarkup = Prism.highlight(
      sampleWithJs,
      Prism.languages.markdown,
      "markdown"
    );

    assert.ok(jsMarkup.includes('class="token code-block"'));
    assert.ok(jsMarkup.includes('class="token language-tag">javascript</span>'));
    assert.ok(jsMarkup.includes('class="token keyword">const</span>'));
    assert.ok(jsMarkup.includes('class="token number">42</span>'));

    const sampleWithUnknownLanguage = [
      `${fence}nonexistentlang`,
      "plain text without errors",
      fence,
    ].join("\n");

    const unknownMarkup = Prism.highlight(
      sampleWithUnknownLanguage,
      Prism.languages.markdown,
      "markdown"
    );

    assert.ok(unknownMarkup.includes('class="token code-block"'));
    assert.ok(unknownMarkup.includes('class="token language-tag">nonexistentlang</span>'));
    assert.ok(unknownMarkup.includes("plain text without errors"));
  });

  it("preserves exact 1:1 line counts and empty lines following fenced code blocks and math", async () => {
    const { Prism } = await import("../assets/vendor/prism.mjs");

    const fence = "```";
    const documentLines = [
      "# Title",
      "",
      "> Quote",
      "",
      "- Hola",
      "- Que tal",
      "",
      "1. Hola",
      "2. Que tal",
      "",
      "[hola](hola)",
      "",
      "---",
      "",
      "- [x] Task",
      "",
      "_italics_, **bold** text",
      "",
      "## Subtitle",
      "",
      "`code block`",
      "",
      `${fence}python`,
      "def main():",
      "  pass",
      fence,
      "",
      "$e=mc^2$",
      "$$e=mc^2$$hello world",
    ];

    const sourceText = documentLines.join("\n");
    const highlightedHtml = Prism.highlight(
      sourceText,
      Prism.languages.markdown,
      "markdown"
    );

    const renderedLines = highlightedHtml.split("\n");
    assert.equal(renderedLines.length, documentLines.length);

    for (let index = 0; index < documentLines.length; index += 1) {
      const originalLine = documentLines[index];
      const strippedRenderedLine = renderedLines[index]
        .replace(/<[^>]+>/g, "")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");

      assert.equal(strippedRenderedLine, originalLine);
    }
  });

  it("tokenizes unquoted and quoted CSS URLs cleanly", async () => {
    const { Prism } = await import("../assets/vendor/prism.mjs");

    const cssWithUrls = "body { background-image: url(images/hero.png); border-image: url('images/border.svg'); }";
    const markup = Prism.highlight(cssWithUrls, Prism.languages.css, "css");

    assert.ok(markup.includes('class="token url"'));
    assert.ok(markup.includes("images/hero.png"));
    assert.ok(markup.includes("images/border.svg"));
  });

  it("tokenizes JavaScript template strings with single-bracket interpolations", async () => {
    const { Prism } = await import("../assets/vendor/prism.mjs");

    const fence = "```";
    const markdownWithJs = [
      `${fence}javascript`,
      "const message = `Hello ${name}!`;",
      fence,
    ].join("\n");

    const markup = Prism.highlight(markdownWithJs, Prism.languages.markdown, "markdown");
    assert.ok(markup.includes('class="token template-string"'));
    assert.ok(markup.includes("Hello ${name}!"));
  });

  it("prevents runaway emphasis from spanning across paragraphs", async () => {
    const { Prism } = await import("../assets/vendor/prism.mjs");

    const multilineParagraphs = [
      "Stray *single asterisk here",
      "",
      "A completely different paragraph *italic text*.",
    ].join("\n");

    const markup = Prism.highlight(multilineParagraphs, Prism.languages.markdown, "markdown");
    const italicTokens = markup.match(/class="token italic"/g) || [];
    assert.equal(italicTokens.length, 1);
    assert.ok(markup.includes('<span class="token italic"><span class="token punctuation">*</span>italic text<span class="token punctuation">*</span></span>'));
  });
});

describe("Syntax Highlighter Controller", () => {
  it("does not set a custom font-size on language-tag in syntax stylesheet", async () => {
    const cssPath = path.join(__dirname, "..", "assets", "styles", "syntax-highlighting.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    assert.equal(cssContent.includes("font-size: 11px;"), false);
  });
  it("synchronizes backdrop layout, handles font sizing, line wrap, and flushes content", async () => {
    const { createSyntaxHighlighter } = await import(
      "../src/renderer/scripts/syntax-highlighter.js"
    );

    const mockTextarea = {
      value: "# Title\nParagraph content.",
      offsetWidth: 400,
      clientWidth: 384,
      scrollTop: 50,
      scrollLeft: 0,
    };

    const classListSet = new Set();
    const mockBackdrop = {
      innerHTML: "",
      scrollTop: 0,
      scrollLeft: 0,
      style: {},
      classList: {
        add(className) {
          classListSet.add(className);
        },
        remove(className) {
          classListSet.delete(className);
        },
        contains(className) {
          return classListSet.has(className);
        },
      },
    };

    const controller = createSyntaxHighlighter(mockTextarea, mockBackdrop);

    controller.flushImmediate();
    assert.ok(mockBackdrop.innerHTML.includes('class="token heading"'));
    assert.equal(mockBackdrop.scrollTop, 50);
    assert.equal(mockBackdrop.style.paddingRight, "30px");

    controller.applyFontSize(16, 24);
    assert.equal(mockBackdrop.style.fontSize, "16px");
    assert.equal(mockBackdrop.style.lineHeight, "24px");

    controller.applyLineWrap(false);
    assert.ok(mockBackdrop.classList.contains("no-wrap"));

    controller.applyLineWrap(true);
    assert.equal(mockBackdrop.classList.contains("no-wrap"), false);

    mockTextarea.value = "body { color: blue; }";
    controller.setLanguage("css");
    assert.ok(mockBackdrop.innerHTML.includes('class="token selector"'));
    assert.ok(mockBackdrop.innerHTML.includes('class="token property"'));
  });

  it("appends trailing break when source text ends with newline", async () => {
    const { createSyntaxHighlighter } = await import(
      "../src/renderer/scripts/syntax-highlighter.js"
    );

    const mockTextarea = {
      value: "line 1\n",
      offsetWidth: 300,
      clientWidth: 300,
      scrollTop: 0,
      scrollLeft: 0,
    };

    const mockBackdrop = {
      innerHTML: "",
      scrollTop: 0,
      scrollLeft: 0,
      style: {},
      classList: {
        add() {},
        remove() {},
      },
    };

    const controller = createSyntaxHighlighter(mockTextarea, mockBackdrop);
    controller.flushImmediate();

    assert.ok(mockBackdrop.innerHTML.endsWith("<br>"));
  });

  it("bypasses expensive grammar tokenization for exceptionally large documents", async () => {
    const { createSyntaxHighlighter } = await import(
      "../src/renderer/scripts/syntax-highlighter.js"
    );

    const largeDocument = "a".repeat(120000);
    const mockTextarea = {
      value: largeDocument,
      offsetWidth: 300,
      clientWidth: 300,
      scrollTop: 0,
      scrollLeft: 0,
    };

    const mockBackdrop = {
      innerHTML: "",
      scrollTop: 0,
      scrollLeft: 0,
      style: {},
      classList: {
        add() {},
        remove() {},
      },
    };

    const controller = createSyntaxHighlighter(mockTextarea, mockBackdrop);
    controller.flushImmediate();

    assert.equal(mockBackdrop.innerHTML.includes('<span class="token'), false);
    assert.equal(mockBackdrop.innerHTML.length, 120000);
  });
});

describe("Syntax Highlighting Electron Integration", () => {
  it("verifies live DOM syntax highlighting updates, tab switching, and style rules in Electron", async () => {
    const testRunnerScript = path.join(
      os.tmpdir(),
      `atarashii-syntax-test-${Date.now()}.js`,
    );
    const scriptContent = `
      const { app, BrowserWindow } = require("electron");
      const path = require("path");
      const fs = require("fs");

      app.whenReady().then(async () => {
        const win = new BrowserWindow({
          width: 1180,
          height: 780,
          show: false,
          webPreferences: {
            preload: path.join("${path.join(__dirname, "..", "src", "preload", "preload.js").replace(/\\/g, "\\\\")}"),
            contextIsolation: true,
            nodeIntegration: false,
          },
        });

        const { registerIpcHandlers } = require("${path.join(__dirname, "..", "src", "main", "ipc-handlers.js").replace(/\\/g, "\\\\")}");
        const dummyLogger = { info() {}, warn() {}, error() {} };
        const dummyConsent = { hasConsent: () => true, grantConsent() {}, clearConsent() {} };
        const dummyConverter = { startLiveConversion: async () => {}, stopLiveConversion: async () => {} };
        registerIpcHandlers(win, dummyLogger, dummyConsent, dummyConverter);

        const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "test-syntax-run-"));
        app.setPath("userData", path.join(tempDir, "user-data"));

        win.loadFile(path.join("${path.join(__dirname, "..", "src", "renderer", "index.html").replace(/\\/g, "\\\\")}"));

        win.webContents.on("did-finish-load", async () => {
          try {
            const testResult = await win.webContents.executeJavaScript(\`
              (async () => {
                const { createScreenManager } = await import("./scripts/screen-manager.js");
                const screenManagerInstance = createScreenManager();
                screenManagerInstance.show("screen-main", "Test Syntax Project");
                await new Promise((resolve) => setTimeout(resolve, 200));

                const textEditorInstance = window.__atarashiiEditor;
                const sampleMarkdown = "# Main Heading\\\\n\\\\nParagraph with **bold text** and \\\\x60inline code\\\\x60.";
                const sampleCss = "body { margin: 0; color: #ffffff; }";

                textEditorInstance.setProject(
                  {
                    projectPath: "\${tempDir.replace(/\\\\/g, "\\\\\\\\")}",
                    markdownFileName: "document.md",
                    cssFileName: "style.css",
                    assetsPath: "\${path.join(tempDir, "assets").replace(/\\\\/g, "\\\\\\\\")}",
                  },
                  {
                    markdownContent: sampleMarkdown,
                    cssContent: sampleCss,
                  }
                );

                await new Promise((resolve) => setTimeout(resolve, 100));

                const syntaxBackdrop = document.getElementById("editor-syntax-backdrop");
                const textarea = document.getElementById("editor-textarea");
                const cssTabButton = document.getElementById("tab-document-css");
                const markdownTabButton = document.getElementById("tab-document-markdown");

                const initialHasHeading = syntaxBackdrop.querySelectorAll(".token.heading").length > 0;
                const initialHasBold = syntaxBackdrop.querySelectorAll(".token.bold").length > 0;
                const initialHasCode = syntaxBackdrop.querySelectorAll(".token.code-inline").length > 0;

                textarea.value = "# New Heading\\\\n\\\\n*italic emphasis*\\\\n\\\\n\\\\x60\\\\x60\\\\x60python\\\\ndef main():\\\\n    pass\\\\n\\\\x60\\\\x60\\\\x60";
                textarea.dispatchEvent(new Event("input"));
                await new Promise((resolve) => setTimeout(resolve, 100));

                const updatedHasHeading = syntaxBackdrop.querySelectorAll(".token.heading").length > 0;
                const updatedHasItalic = syntaxBackdrop.querySelectorAll(".token.italic").length > 0;
                const updatedHasCodeBlock = syntaxBackdrop.querySelectorAll(".token.code-block").length > 0;
                const updatedHasPythonKeyword = syntaxBackdrop.querySelectorAll(".token.code-block .token.keyword").length > 0;
                const updatedHasPythonFunction = syntaxBackdrop.querySelectorAll(".token.code-block .token.function").length > 0;

                cssTabButton.click();
                while (!cssTabButton.classList.contains("active-tab")) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                await new Promise((resolve) => setTimeout(resolve, 100));

                const cssHasSelector = syntaxBackdrop.querySelectorAll(".token.selector").length > 0;
                const cssHasProperty = syntaxBackdrop.querySelectorAll(".token.property").length > 0;
                const cssHasNumber = syntaxBackdrop.querySelectorAll(".token.number").length > 0;

                const textareaComputedStyle = window.getComputedStyle(textarea);
                const isTextareaTransparent = textareaComputedStyle.color === "rgba(0, 0, 0, 0)" || textareaComputedStyle.color === "transparent";

                markdownTabButton.click();
                while (!markdownTabButton.classList.contains("active-tab")) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                await new Promise((resolve) => setTimeout(resolve, 100));

                const returnMarkdownHasHeading = syntaxBackdrop.querySelectorAll(".token.heading").length > 0;

                return {
                  ok: true,
                  initialHasHeading,
                  initialHasBold,
                  initialHasCode,
                  updatedHasHeading,
                  updatedHasItalic,
                  updatedHasCodeBlock,
                  updatedHasPythonKeyword,
                  updatedHasPythonFunction,
                  cssHasSelector,
                  cssHasProperty,
                  cssHasNumber,
                  isTextareaTransparent,
                  returnMarkdownHasHeading,
                };
              })()
            \`);

            console.log("SYNTAX_TEST_RESULT:" + JSON.stringify(testResult));
            win.destroy();
            app.quit();
          } catch (error) {
            console.error("SYNTAX_TEST_ERROR:", error);
            win.destroy();
            app.quit();
          }
        });
      });
    `;

    fs.writeFileSync(testRunnerScript, scriptContent, "utf8");

    const electronExecutable = require("electron");
    const childProcess = spawn(electronExecutable, [testRunnerScript], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let outputJson = "";
    childProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes("SYNTAX_TEST_RESULT:")) {
        const marker = "SYNTAX_TEST_RESULT:";
        outputJson = text.substring(text.indexOf(marker) + marker.length).trim();
      }
    });

    const exitCode = await new Promise((resolve) => {
      childProcess.on("close", resolve);
    });

    try {
      fs.unlinkSync(testRunnerScript);
    } catch {}

    assert.equal(exitCode, 0);
    assert.ok(outputJson.length > 0);
    const parsed = JSON.parse(outputJson);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.initialHasHeading, true);
    assert.equal(parsed.initialHasBold, true);
    assert.equal(parsed.initialHasCode, true);
    assert.equal(parsed.updatedHasHeading, true);
    assert.equal(parsed.updatedHasItalic, true);
    assert.equal(parsed.updatedHasCodeBlock, true);
    assert.equal(parsed.updatedHasPythonKeyword, true);
    assert.equal(parsed.updatedHasPythonFunction, true);
    assert.equal(parsed.cssHasSelector, true);
    assert.equal(parsed.cssHasProperty, true);
    assert.equal(parsed.cssHasNumber, true);
    assert.equal(parsed.isTextareaTransparent, true);
    assert.equal(parsed.returnMarkdownHasHeading, true);
  });
});
