from __future__ import annotations

import io
import tarfile
from pathlib import Path
from typing import Any

import pytest
from conftest import ROOT, load_file


def load_resource_files_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "target" / "cluster-agent" / "commands" / "resource_files.py",
        "test_cluster_agent_resource_files_module",
    )


def tar_layer(path: Path, files: dict[str, bytes], whiteouts: tuple[str, ...] = ()) -> None:
    with tarfile.open(path, "w:gz") as archive:
        for name, content in files.items():
            info = tarfile.TarInfo(name=name)
            info.size = len(content)
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(content))
        for name in whiteouts:
            info = tarfile.TarInfo(name=name)
            info.size = 0
            archive.addfile(info, io.BytesIO())


def test_image_layer_index_applies_whiteouts_without_extracting_untrusted_paths(
    tmp_path: Path,
) -> None:
    module = load_resource_files_module()
    first = tmp_path / "layer-1.tar.gz"
    second = tmp_path / "layer-2.tar.gz"
    tar_layer(first, {"etc/old.conf": b"old", "etc/keep.conf": b"keep"})
    tar_layer(
        second,
        {"etc/new.conf": b"new", "../../escape": b"blocked"},
        ("etc/.wh.old.conf",),
    )

    index = module.ImageLayerIndex.from_layers((first, second))

    assert [entry.path for entry in index.list_directory("/etc")] == [
        "/etc/keep.conf",
        "/etc/new.conf",
    ]
    assert index.read_file("/etc/new.conf", offset=0, limit=8) == (b"new", True, 3)
    assert not (tmp_path.parent / "escape").exists()


def test_find_parser_sorts_directories_first_and_pages_without_losing_identity() -> None:
    module = load_resource_files_module()
    output = (
        b"\0".join(
            (
                b"f\t20\t1710000000\t644\t/var/log/z.log",
                b"d\t0\t1710000001\t755\t/var/log/archive",
                b"l\t4\t1710000002\t777\t/var/log/current\tarchive/latest",
            )
        )
        + b"\0"
    )

    entries = module.parse_find_records(output, "/var/log")
    page, next_cursor = module.paginate_entries(entries, cursor=0, limit=2)

    assert [entry.path for entry in page] == ["/var/log/archive", "/var/log/current"]
    assert next_cursor == 2
    assert entries[1].link_target == "archive/latest"


def test_exec_commands_quote_paths_and_never_accept_relative_traversal() -> None:
    module = load_resource_files_module()

    command = module.pod_file_read_command("/tmp/a file;echo unsafe", offset=4, limit=32)

    assert "'/tmp/a file;echo unsafe'" in command
    assert "skip=4" in command
    with pytest.raises(ValueError, match="absolute POSIX"):
        module.pod_directory_list_command("../etc")
