import json
import tempfile
import unittest
from pathlib import Path
from extract_markdown import write_progress, extract_fast
import pymupdf


class ProgressTests(unittest.TestCase):
    def test_local_pages_and_atomic_progress(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.pdf"
            out = Path(directory) / "source.fast.md"
            with pymupdf.open() as doc:
                for _ in range(3):
                    doc.new_page().insert_text((72, 72), "Test")
                doc.save(source)
            extract_fast(source, out)
            data = json.loads(out.with_suffix(".progress.json").read_text())
            self.assertEqual((data["completed"], data["total"]), (3, 3))
            self.assertGreater(data["updatedAt"], 0)
            self.assertFalse(out.with_suffix(".progress.json.tmp").exists())

    def test_unwritable_progress_does_not_fail_conversion(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory) / "file"
            parent.write_text("occupied")
            write_progress(parent / "out.md", 1, 2)
