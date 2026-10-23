"""Execute the current wipe handler with fake dependencies; never access a database.

Run directly with Python when the full pytest/server environment is unavailable.
This checks completion reporting, not database deletion or authentication.
"""

import ast
import logging
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class WipeCompletionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        path = Path(__file__).parents[1] / "api/routes/maintenance.py"
        tree = ast.parse(path.read_text())
        function = next(
            node
            for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "remote_wipe_data"
        )
        function.decorator_list = []
        function.args.defaults = []
        for arg in function.args.args:
            arg.annotation = None
        function.returns = None
        module = ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[]))
        logger = logging.getLogger("isolated-wipe-verification")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        namespace = {
            "HTTPException": FakeHTTPException,
            "SuccessResponse": lambda **kwargs: SimpleNamespace(**kwargs),
            "logger": logger,
        }
        exec(compile(module, str(path), "exec"), namespace)
        self.handler = namespace["remote_wipe_data"]
        self.repo = SimpleNamespace(
            organization_id="verification-only",
            clear_all_attendance_data=AsyncMock(return_value={"records_deleted": 1}),
            add_audit_log=AsyncMock(),
        )
        self.recognizer = SimpleNamespace(
            clear_database=AsyncMock(return_value={"success": True})
        )
        dependency = ModuleType("api.recognition_deps")
        dependency.get_face_recognizer = AsyncMock(return_value=self.recognizer)
        self.modules = patch.dict(
            sys.modules, {"api": ModuleType("api"), "api.recognition_deps": dependency}
        )
        self.modules.start()
        self.addCleanup(self.modules.stop)

    async def test_success_requires_both_removal_steps(self):
        result = await self.handler(self.repo)
        self.assertIn("Remote wipe completed", result.message)
        self.repo.clear_all_attendance_data.assert_awaited_once()
        self.recognizer.clear_database.assert_awaited_once_with("verification-only")
        self.repo.add_audit_log.assert_awaited_once()

    async def test_false_face_result_reports_partial_failure(self):
        self.recognizer.clear_database.return_value = {"success": False}
        with self.assertRaises(FakeHTTPException) as caught:
            await self.handler(self.repo)
        self.assertEqual(caught.exception.status_code, 500)
        self.assertIn("Local attendance was cleared", caught.exception.detail)
        self.repo.add_audit_log.assert_not_awaited()

    async def test_face_exception_cannot_report_success(self):
        self.recognizer.clear_database.side_effect = RuntimeError(
            "synthetic face removal failure"
        )
        with self.assertRaises(FakeHTTPException) as caught:
            await self.handler(self.repo)
        self.assertEqual(caught.exception.status_code, 500)
        self.repo.add_audit_log.assert_not_awaited()

    async def test_attendance_exception_stops_before_face_removal(self):
        self.repo.clear_all_attendance_data.side_effect = RuntimeError(
            "synthetic attendance failure"
        )
        with self.assertRaises(FakeHTTPException):
            await self.handler(self.repo)
        self.recognizer.clear_database.assert_not_awaited()
        self.repo.add_audit_log.assert_not_awaited()


if __name__ == "__main__":
    unittest.main(verbosity=2)
