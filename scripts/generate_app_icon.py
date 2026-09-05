"""Multi-resolution Windows icon generator for Electron applications.

Converts a high-resolution source PNG asset into a multi-frame ICO file
containing standard Windows icon sizes required by Electron and electron-builder.
"""

from __future__ import annotations

import argparse
import logging
import struct
import sys
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from PIL import Image

STANDARD_ELECTRON_ICON_SIZES: tuple[tuple[int, int], ...] = (
    (16, 16),
    (24, 24),
    (32, 32),
    (48, 48),
    (64, 64),
    (128, 128),
    (256, 256),
)

ICO_DIRECTORY_HEADER_FORMAT: str = "<HHH"
ICO_DIRECTORY_ENTRY_FORMAT: str = "<BBBBHHII"
PNG_SIGNATURE: bytes = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class IconLayerMetadata:
    """Represents binary metadata for an individual frame within an ICO file."""

    width: int
    height: int
    color_count: int
    reserved: int
    planes: int
    bits_per_pixel: int
    data_size: int
    data_offset: int
    is_png_format: bool


def configure_logging(log_file_path: Path) -> logging.Logger:
    """Configures multi-channel logging writing to both file and standard error.

    Args:
        log_file_path: Destination path for detailed log entries.

    Returns:
        Configured logger instance.
    """
    log_file_path.parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("generate_app_icon")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.FileHandler(filename=log_file_path, mode="w", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler(stream=sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    return logger


def validate_source_image(source_image_path: Path, logger: logging.Logger) -> Image.Image:
    """Opens and validates the source image file.

    Args:
        source_image_path: Path to the input PNG image.
        logger: Active logging instance.

    Returns:
        Loaded PIL Image instance converted to RGBA color space.

    Raises:
        FileNotFoundError: If the source image path does not exist.
        ValueError: If the source image dimensions are insufficient.
    """
    if not source_image_path.is_file():
        raise FileNotFoundError(f"Source image not found: {source_image_path.resolve()}")

    logger.info("Loading source image from %s", source_image_path.resolve())
    loaded_image = Image.open(source_image_path)
    rgba_image = loaded_image.convert("RGBA")

    width, height = rgba_image.size
    logger.info("Source image dimensions: %dx%d, format: %s", width, height, loaded_image.format)

    if width < 256 or height < 256:
        raise ValueError(
            f"Source image dimensions ({width}x{height}) must be at least 256x256 pixels."
        )

    return rgba_image


def generate_ico_file(
    source_image: Image.Image,
    destination_ico_path: Path,
    target_sizes: Sequence[tuple[int, int]],
    logger: logging.Logger,
) -> Path:
    """Generates a multi-resolution ICO file from the source image.

    Args:
        source_image: Source RGBA image to resize and package.
        destination_ico_path: Target path for the output ICO file.
        target_sizes: Collection of width-height dimension pairs to embed.
        logger: Active logging instance.

    Returns:
        Absolute path to the created ICO file.
    """
    destination_ico_path.parent.mkdir(parents=True, exist_ok=True)
    sorted_sizes = sorted(set(target_sizes))

    logger.info(
        "Generating ICO with %d layers at %s: %s",
        len(sorted_sizes),
        destination_ico_path.resolve(),
        sorted_sizes,
    )

    source_image.save(
        destination_ico_path,
        format="ICO",
        sizes=sorted_sizes,
    )

    logger.info("ICO file successfully written to %s", destination_ico_path.resolve())
    return destination_ico_path.resolve()


def inspect_ico_file(
    ico_path: Path,
    expected_sizes: Sequence[tuple[int, int]],
    logger: logging.Logger,
) -> list[IconLayerMetadata]:
    """Parses and validates the binary structure of an ICO file.

    Args:
        ico_path: Path to the generated ICO file to inspect.
        expected_sizes: Expected dimension tuples for validation.
        logger: Active logging instance.

    Returns:
        List of parsed layer metadata records.

    Raises:
        ValueError: If the file header or layer count does not match expectations.
    """
    raw_data = ico_path.read_bytes()
    reserved, resource_type, image_count = struct.unpack_from(
        ICO_DIRECTORY_HEADER_FORMAT, raw_data, 0
    )

    if reserved != 0 or resource_type != 1:
        raise ValueError(
            f"Invalid ICO header: reserved={reserved}, type={resource_type} (expected 0 and 1)."
        )

    if image_count != len(expected_sizes):
        raise ValueError(
            f"Layer count mismatch: found {image_count}, expected {len(expected_sizes)}."
        )

    parsed_layers: list[IconLayerMetadata] = []
    header_offset = struct.calcsize(ICO_DIRECTORY_HEADER_FORMAT)
    entry_size = struct.calcsize(ICO_DIRECTORY_ENTRY_FORMAT)

    for layer_index in range(image_count):
        entry_offset = header_offset + (layer_index * entry_size)
        (
            raw_width,
            raw_height,
            color_count,
            reserved_byte,
            planes,
            bpp,
            data_size,
            data_offset,
        ) = struct.unpack_from(ICO_DIRECTORY_ENTRY_FORMAT, raw_data, entry_offset)

        resolved_width = 256 if raw_width == 0 else raw_width
        resolved_height = 256 if raw_height == 0 else raw_height

        layer_bytes = raw_data[data_offset : data_offset + data_size]
        is_png = layer_bytes.startswith(PNG_SIGNATURE)

        layer_metadata = IconLayerMetadata(
            width=resolved_width,
            height=resolved_height,
            color_count=color_count,
            reserved=reserved_byte,
            planes=planes,
            bits_per_pixel=bpp,
            data_size=data_size,
            data_offset=data_offset,
            is_png_format=is_png,
        )
        parsed_layers.append(layer_metadata)

        logger.debug(
            "Parsed layer %d: %dx%d, %d bytes, offset=%d, png_container=%s",
            layer_index,
            resolved_width,
            resolved_height,
            data_size,
            data_offset,
            is_png,
        )

    found_dimensions = [(layer.width, layer.height) for layer in parsed_layers]
    expected_sorted = sorted(set(expected_sizes))

    if sorted(found_dimensions) != expected_sorted:
        raise ValueError(
            f"Embedded layer dimensions {found_dimensions} do not match expected {expected_sorted}."
        )

    logger.info("Binary verification passed: all %d layers validated successfully.", image_count)
    return parsed_layers


def parse_command_line_arguments() -> argparse.Namespace:
    """Parses command line arguments with project default fallback paths.

    Returns:
        Parsed argument namespace.
    """
    repository_root = Path(__file__).resolve().parent.parent
    default_source = repository_root / "assets" / "icons" / "app-icon.png"
    default_destination = repository_root / "assets" / "icons" / "app-icon.ico"
    default_log = repository_root / "scripts" / "generate_app_icon.log"

    argument_parser = argparse.ArgumentParser(
        description="Generate a multi-resolution Windows ICO file for Electron from a source PNG."
    )
    argument_parser.add_argument(
        "--input",
        "-i",
        type=Path,
        default=default_source,
        help=f"Path to input PNG image (default: {default_source})",
    )
    argument_parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=default_destination,
        help=f"Path to output ICO file (default: {default_destination})",
    )
    argument_parser.add_argument(
        "--log-file",
        type=Path,
        default=default_log,
        help=f"Path to log output file (default: {default_log})",
    )

    return argument_parser.parse_args()


def main() -> int:
    """Orchestrates icon generation with logging and loud error reporting.

    Returns:
        Process exit code integer (0 on success, 1 on failure).
    """
    arguments = parse_command_line_arguments()
    logger = configure_logging(arguments.log_file)

    try:
        source_image = validate_source_image(arguments.input, logger)
        generate_ico_file(
            source_image=source_image,
            destination_ico_path=arguments.output,
            target_sizes=STANDARD_ELECTRON_ICON_SIZES,
            logger=logger,
        )
        inspect_ico_file(
            ico_path=arguments.output,
            expected_sizes=STANDARD_ELECTRON_ICON_SIZES,
            logger=logger,
        )
        logger.info("Icon generation completed successfully.")
        return 0
    except Exception as execution_error:
        logger.error(
            "Icon generation failed: %s\n%s",
            execution_error,
            traceback.format_exc(),
        )
        sys.stderr.write(f"\n[FATAL ERROR] {execution_error}\n")
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
