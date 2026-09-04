# Project definition for Atarashii, a live editing Markdown to PDF app

## Introduction

Atarashii is a live markdown to pdf, text editing and conversion app for Windows with a webview frontend (electron or similar), and a Python package as a "backend" (invoked through an os shell command)

To create this app, take the projects in the reference folder as a guide, you may copy the code that is useful from them and adapt it, implement the glue code to connect all the parts, and code the rest from scratch.

## Windows and functionality

### Welcome screen

- Contains a centered window with two buttons, arranged one on top of another, with centered text and no icons. (see References/screens/welcome.png)
  - New project: Moves to the "New project" screen when clicked.
  - Open project: Opens a folder picker dialogue for the user to select a folder. Displays an error if the folder contains:
    1. More than one .md file. Error: "Atarashii only supports one markdown document per project. To edit multiple markdown files, please create a project folder for each of them."
    2. No .md files. Error: "The project folder contains no markdown files."

### New project screen

- Contains a centered window with two text fields, with one label on top of each, and two action buttons (see References/screens/new_project.png):
  - Label: Atarashii projects folder
  - Textfield: (default) USER_HOME/DOCUMENTS_DIR/Ararashii
  - Label: Name
  - Textfield: (default) New project (+_N until the first non taken name)
  - Left button: Cancel
  - Right button: Continue

- Clicking on the Continue button will: Create a folder named "Name" (textfield) with the following empty files/folders inside: "document.md", "style.css", "assets/"
- Move the app to the "Main screen"

### Main screen

- Consists of two panels side by side. (see References/screens/main_screen.png) The panels have a rounded border and a top bar with floating buttons that mostly function as tabs, with a content pane below them. There is significant distinction between the left and right panels.

- Left panel:
  - Top tab button bar (no background or border, just floating buttons):
    - Button: document.md. Default active tab. On click, switches the content pane to a text editor with the document.md file open.
    - Button: style.css. On click, switches the content pane to a text editor with the style.css file open.
    - Button: (folder icon with no text): On click, opens the "assets" folder in Windows file explorer. Does not switch the active tab.
  - Content pane. Displays the active tab. For both markdown and css, autosave after 500ms of inactivity. For markdown: auto formatting with markdownlint on save. For css: autoformatting with prettier on save.
  - Collapsing arrow: Vertically centered to the right of the panel, collapses the panel and remains visible to extend the panel back again when clicked.

- Right panel:
  - Top tab button bar (no background or border, just floating buttons:
    - Button: document.pdf: Default active tab. On click, switches the content pane to the exact pdf viewer in References/smoothpdf, do not reimplement this viewer, just adapt it directly from that reference.
    - Button: conversion.log: On click, switches the active tab to display the output of the running conversion command in the content pane, see the bottom of this section.
  - Content pane. Displays the active tab.
  - Collapsing arrow: Vertically centered to the left of the panel, collapses the panel and remains visible to extend the panel back again when clicked.

- Functionality: Runs the command `markdown-convert document.md --css=style.css --mode=live --out=document.pdf` and streams the output of the command to conversion.log. The command blocks and outputs information whenever it detects that the document.md file has changed on disk, as it automatically converts it to pdf on every file change.

- To manage the installation of the markdown-convert python package, see References/markdown-convert-gui. In particular, see the requirements screen, that checks for requirements and installs them, and the update checking screen, that checks for markdown-convert updates at startup and updates the package. You can directly integrate those screens into this app, that only show if there are missing runtime dependencies (uv, or markdown-convert), or if markdown-convert is out of date. If not, they do not appear at all.

## References

- references
  - screens: Contains sketches for each screen of the app. The layout is what matters, the exact appearance is not definitive, they're just rough sketches.
  - smooth-pdf: Contains a standalone live pdf viewer, to take as direct reference for the pdf preview panel (right panel)
  - markdown-convert-gui: Contains a markdown to pdf conversion gui (frontend for the markdown-convert python package). To take as direct reference for runtime dependency installation and updating.
  - color_palette.css: Contains the exact colors to use to style the app's interface. It should have a dark theme, with `--darkest-gray` as the background color, using `--darker-gray` sparingly for buttons, `--dark-gray` for borders, and `--lightest-gray` for text. Buttons should use a similar combination of colors from the color palette, like `--lighter-red` for danger button borders and text and `--dark-red` for the button background for example.