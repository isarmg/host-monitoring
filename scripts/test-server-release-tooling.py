#!/usr/bin/env python3
"""Offline unit tests for Host Monitoring server release tooling."""

from __future__ import annotations

import importlib.util
import stat
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("package-server-release.py")
SPEC = importlib.util.spec_from_file_location("package_server_release", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("could not load package-server-release.py")
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)


class ReleaseToolingTests(unittest.TestCase):
    def test_release_host_is_exactly_linux_x86_64(self) -> None:
        PACKAGE.require_release_host("Linux", "x86_64", "glibc 2.41")
        for system, machine, libc in [
            ("Linux", "aarch64", "glibc 2.41"),
            ("Linux", "x86_64", "musl 1.2.5"),
            ("Darwin", "x86_64", None),
            ("Windows", "AMD64", None),
        ]:
            with self.subTest(system=system, machine=machine, libc=libc):
                with self.assertRaisesRegex(
                    SystemExit, "require an x86_64 GNU/Linux build host"
                ):
                    PACKAGE.require_release_host(system, machine, libc)

    def test_server_build_uses_the_only_supported_target(self) -> None:
        self.assertEqual(
            PACKAGE.server_build_command(),
            [
                "cargo",
                "build",
                "--locked",
                "--release",
                "-p",
                "host-monitoring-server",
                "--target",
                "x86_64-unknown-linux-gnu",
            ],
        )
        target_directory = Path("/tmp/release-target")
        self.assertEqual(
            PACKAGE.built_server_path(target_directory),
            target_directory
            / "x86_64-unknown-linux-gnu/release/host-monitoring-server",
        )

    def test_copy_exclusive_creates_read_only_content(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            destination = root / "destination"
            source.write_bytes(b"current archive")
            PACKAGE.copy_exclusive(source, destination)
            self.assertEqual(destination.read_bytes(), b"current archive")
            self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o444)
            self.assertEqual(destination.stat().st_nlink, 1)

    def test_copy_exclusive_never_overwrites_or_unlinks_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            destination = root / "destination"
            source.write_bytes(b"new archive")
            destination.write_bytes(b"published archive")
            with self.assertRaises(FileExistsError):
                PACKAGE.copy_exclusive(source, destination)
            self.assertEqual(destination.read_bytes(), b"published archive")


if __name__ == "__main__":
    unittest.main()
