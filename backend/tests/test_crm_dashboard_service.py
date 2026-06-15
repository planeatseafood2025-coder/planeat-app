import unittest
from datetime import datetime, timezone

from app.services.crm_dashboard_service import (
    derive_account_business_fields,
    get_account_health,
    is_stalled_deal,
    _is_in_period,
)


class CrmDashboardServiceTests(unittest.TestCase):
    def test_derives_domestic_country_and_geo_fields_for_thailand(self):
        fields = derive_account_business_fields(
            {
                "country": "ไทย",
                "coordinates": [100.5018, 13.7563],
            }
        )

        self.assertEqual(fields["marketScope"], "domestic")
        self.assertEqual(fields["countryCode"], "TH")
        self.assertEqual(fields["regionKey"], "asean")
        self.assertEqual(fields["geoStatus"], "mapped")

    def test_derives_international_country_only_fields_for_japan(self):
        fields = derive_account_business_fields({"country": "Japan", "coordinates": []})

        self.assertEqual(fields["marketScope"], "international")
        self.assertEqual(fields["countryCode"], "JP")
        self.assertEqual(fields["regionKey"], "east_asia")
        self.assertEqual(fields["geoStatus"], "country_only")

    def test_account_health_uses_last_contact_age(self):
        now = datetime(2026, 6, 5, tzinfo=timezone.utc)

        self.assertEqual(get_account_health("2026-05-20T00:00:00+00:00", now), "healthy")
        self.assertEqual(get_account_health("2026-04-01T00:00:00+00:00", now), "watchlist")
        self.assertEqual(get_account_health("2026-01-01T00:00:00+00:00", now), "dormant")

    def test_stalled_deal_uses_stage_specific_threshold(self):
        now = datetime(2026, 6, 5, tzinfo=timezone.utc)

        self.assertTrue(
            is_stalled_deal(
                {"stage": "proposal", "stageUpdatedAt": "2026-05-01T00:00:00+00:00"},
                now,
            )
        )
        self.assertFalse(
            is_stalled_deal(
                {"stage": "proposal", "stageUpdatedAt": "2026-05-25T00:00:00+00:00"},
                now,
            )
        )


    def test_is_in_period_month_mode_matches_specific_month(self):
        now = datetime(2026, 6, 15, tzinfo=timezone.utc)
        doc = {"stageUpdatedAt": "2026-03-10T00:00:00+00:00"}

        self.assertTrue(
            _is_in_period(doc, {"period": "month", "year": "2026", "month": "3"}, now)
        )
        self.assertFalse(
            _is_in_period(doc, {"period": "month", "year": "2026", "month": "6"}, now)
        )
        # ไม่ส่ง year/month → fallback เป็นเดือนปัจจุบัน (now=มิ.ย.) จึงไม่แมตช์ มี.ค.
        self.assertFalse(_is_in_period(doc, {"period": "month"}, now))


if __name__ == "__main__":
    unittest.main()
