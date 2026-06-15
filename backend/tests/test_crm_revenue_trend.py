import unittest

from app.services.crm_revenue_service import compute_revenue_trend


class ComputeRevenueTrendTests(unittest.TestCase):
    def test_splits_forecast_and_actual_by_month(self):
        targets = [{"month": 6, "targetThb": 500000}]
        deals = [
            {"stage": "proposal", "forecastDate": "2026-06-10", "forecastAmount": 200000},
            {"stage": "won", "actualReceivedAt": "2026-06-20", "actualAmount": 120000},
            {"stage": "won", "actualReceivedAt": "2026-05-15", "actualAmount": 80000},
            {"stage": "lost", "forecastDate": "2026-06-01", "forecastAmount": 999999},
        ]

        months = compute_revenue_trend(2026, targets, deals)

        self.assertEqual(len(months), 12)
        june = months[5]
        self.assertEqual(june["month"], 6)
        self.assertEqual(june["targetThb"], 500000)
        self.assertEqual(june["forecastThb"], 200000)  # lost ไม่ถูกนับ
        self.assertEqual(june["actualThb"], 120000)
        self.assertEqual(months[4]["actualThb"], 80000)  # พ.ค.
        self.assertEqual(months[0]["actualThb"], 0)      # ม.ค. ว่าง

    def test_handles_missing_fields(self):
        months = compute_revenue_trend(2026, [], [{"stage": "won"}])
        self.assertEqual(months[5]["actualThb"], 0)
        self.assertEqual(months[5]["targetThb"], 0)


if __name__ == "__main__":
    unittest.main()
