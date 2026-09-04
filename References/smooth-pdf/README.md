<p align="center">
  <img
    src="https://github.com/Julynx/smoothpdf/blob/main/public/icon.png"
    width="200px"
  />
</p>

<h3 align="center">SmoothPDF</h3>
<p align="center">
  <i
    >A modern PDF viewer designed for live preview workflows, with smooth
    animations instead of flickering.</i
  >
</p>

<hr />

<p align="center">
  <a
    href="https://github.com/Julynx/smoothpdf/releases/latest/download/SmoothPDF_Setup.exe"
    target="_blank"
  >
    <img
      src="https://raw.githubusercontent.com/Julynx/julynx/refs/heads/main/assets/download.png"
      height="48"
    /> </a
  ><br /><br />
</p>

https://github.com/user-attachments/assets/72e8df1a-28be-475f-9590-f581fb8fda5b

> The workflow depicted in the video above involves editing a Markdown file in the Zed editor with autosave enabled, and uses `markdown-convert` with the `--mode=live` flag to convert it to PDF in the background as I type.
> It is meant to showcase how SmoothPDF handles the file changing on disk, and renders the changes seamlessly in real time without flickering.

## Why SmoothPDF?

I am yet to find a PDF viewer that doesn’t flicker (or leak memory and crash) whenever the open PDF file changes on disk.

Most PDF viewers do not support live reloading, making them essentially unusable for such workflows. Opening a PDF with Chrome, for example, requires reloading the page to update the preview whenever the file changes.

Other PDF viewers, such as MuPDF, while excellent in most aspects, require programs to explicitly send a signal to the window telling it to reload its contents, instead of dynamically watching the file on disk for changes.

Finally, I found Sioyek to leak memory and frequently crash after the document changes on disk, especially with PDFs that contain a lot of images.

Every other PDF viewer I’ve tried that is not mentioned here either does not update in real time, or does, but flickers briefly, which I find extremely distracting and painful to the eyes.

SmoothPDF was made with the help of Antigravity in a couple of evenings; it is not technically better in any way than any of the projects mentioned above. It does, however, implement a smart, yet simple strategy to update PDF files in real time without flickering, one that I haven’t seen anywhere else.

## How SmoothPDF handles live updates

When the open PDF changes on disk, it is rendered behind the current (outdated) view. Then, the current view is smoothly faded out until only the new view is displayed.

This makes flickering impossible, as only the modified elements appear to change, and they do so with a faded transition.

## Feature set

SmoothPDF is intentionally simple. It supports:

- Different zoom levels, including “fit to width” and “fit to height”.
- Selectable text and section links.
- Travel to page with number.
- Printing documents (opens system dialogue).
