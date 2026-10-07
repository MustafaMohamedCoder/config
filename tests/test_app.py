import io
import unittest

from app import app, decode_bytes, encode_bytes


class ZteConfigWebTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_homepage_loads(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("ZTE Config Studio", response.get_data(as_text=True))

    def test_routes_manifest_loads(self):
        response = self.client.get("/manus-routes.json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["routes"][0]["path"], "/")

    def test_type_zero_round_trip(self):
        xml = b"<DB><entry name='demo'>value</entry></DB>"
        encoded = encode_bytes(xml, {"payload_type": "0", "include_header": "false", "signature": ""})
        decoded, metadata = decode_bytes(encoded, {"key_mode": "default"})
        self.assertEqual(decoded, xml)
        self.assertEqual(metadata["payload_type"], 0)

    def test_invalid_xml_is_rejected(self):
        response = self.client.post("/api/encode", data={"xml": "<broken"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("XML غير صالح", response.get_json()["error"])

    def test_xml_upload_encode(self):
        response = self.client.post(
            "/api/encode-upload",
            data={
                "xml_file": (io.BytesIO(b"<DB><entry>ok</entry></DB>"), "config.xml"),
                "payload_type": "0",
                "include_header": "false",
                "signature": "",
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/octet-stream")
        self.assertGreater(len(response.data), 0)

    def test_missing_file_is_rejected(self):
        response = self.client.post("/api/decode", data={})
        self.assertEqual(response.status_code, 400)
        self.assertIn("اختر ملف", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
