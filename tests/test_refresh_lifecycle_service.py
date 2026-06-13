import unittest

from refresh_lifecycle_service import RefreshLifecycleService


class RefreshLifecycleServiceTests(unittest.TestCase):
    def make_service(
        self,
        *,
        refresh_with_rt=None,
        refresh_with_session=None,
        probe=None,
        session_to_auth=None,
    ):
        def coerce_text(value):
            return str(value or "").strip()

        def first_text(*values):
            return next((coerce_text(value) for value in values if coerce_text(value)), "")

        def fake_refresh_rt(token):
            if refresh_with_rt:
                return refresh_with_rt(token)
            return 400, {"error": {"code": "invalid_grant", "message": "bad token"}}, "bad token"

        def fake_refresh_session(token):
            if refresh_with_session:
                return refresh_with_session(token)
            return 401, {"error": "expired"}, "expired"

        def fake_probe(token):
            if probe:
                return probe(token)
            return {"status": "active", "message": "账号可用", "plan_type": "plus", "credential_ok": True}

        def fake_session_to_auth(session_payload, fallback):
            if session_to_auth:
                return session_to_auth(session_payload, fallback)
            return {
                "email": fallback.get("email") or session_payload.get("email"),
                "name": fallback.get("name") or session_payload.get("email"),
                "access_token": session_payload.get("access_token"),
                "refresh_token": session_payload.get("refresh_token"),
                "expired": session_payload.get("expires_at", ""),
            }

        return RefreshLifecycleService(
            coerce_text=coerce_text,
            first_text=first_text,
            refresh_openai_with_rt=fake_refresh_rt,
            refresh_openai_with_session_token=fake_refresh_session,
            probe_openai_access_token=fake_probe,
            access_token_expires_at=lambda token: "2026-06-14T12:00:00+00:00" if token else "",
            session_to_cpa_auth=fake_session_to_auth,
        )

    def test_refresh_returns_empty_summary_when_no_items(self):
        service = self.make_service()

        result = service.refresh({})

        self.assertTrue(result["success"])
        self.assertEqual(result["results"], [])
        self.assertEqual(result["summary"]["total"], 0)
        self.assertEqual(result["summary"]["failed"], 0)

    def test_refresh_item_with_refresh_token_builds_auth_file(self):
        service = self.make_service(
            refresh_with_rt=lambda token: (
                200,
                {
                    "access_token": "access-new",
                    "refresh_token": "refresh-new",
                    "id_token": "id-new",
                },
                "",
            )
        )

        result = service.refresh_item({
            "email": "user@example.com",
            "refresh_token": "refresh-old",
            "row": {"email": "user@example.com", "name": "User"},
        })

        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "rt_rotated")
        self.assertEqual(result["status_label"], "已刷新并轮换 RT")
        self.assertTrue(result["access_token_updated"])
        self.assertTrue(result["refresh_token_rotated"])
        self.assertEqual(result["auth_file"]["refresh_token"], "refresh-new")

    def test_refresh_item_classifies_banned_refresh_token(self):
        service = self.make_service(
            refresh_with_rt=lambda token: (
                400,
                {"error": {"code": "invalid_grant", "message": "Account disabled"}},
                "Account disabled",
            )
        )

        result = service.refresh_item({
            "email": "banned@example.com",
            "refresh_token": "rt-banned",
        })

        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "banned")
        self.assertEqual(result["status_label"], "封禁/停用")

    def test_refresh_item_with_access_token_uses_probe(self):
        service = self.make_service(
            probe=lambda token: {
                "status": "usage_limit_reached",
                "message": "额度已用完",
                "plan_type": "free",
                "credential_ok": True,
            }
        )

        result = service.refresh_item({
            "email": "quota@example.com",
            "access_token": "access-only",
        })

        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "usage_limit_reached")
        self.assertEqual(result["plan_type"], "free")

    def test_summary_counts_expected_buckets(self):
        service = self.make_service()

        summary = service.summary([
            {"ok": True, "status": "active"},
            {"ok": True, "status": "rt_rotated"},
            {"ok": False, "status": "rt_invalid"},
            {"ok": False, "status": "banned"},
            {"ok": False, "status": "risk_blocked"},
            {"ok": False, "status": "needs_login"},
        ], uploaded=2)

        self.assertEqual(summary["total"], 6)
        self.assertEqual(summary["active"], 2)
        self.assertEqual(summary["refreshed"], 2)
        self.assertEqual(summary["invalid"], 1)
        self.assertEqual(summary["banned"], 1)
        self.assertEqual(summary["risk"], 1)
        self.assertEqual(summary["needs_login"], 1)
        self.assertEqual(summary["failed"], 4)
        self.assertEqual(summary["uploaded"], 2)


if __name__ == "__main__":
    unittest.main()
