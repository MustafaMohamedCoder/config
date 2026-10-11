import io
import base64
import unittest

from app import app, decode_bytes, encode_bytes


class ZteConfigWebTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_homepage_loads(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Config Studio", response.get_data(as_text=True))
        self.assertIn('value="huawei"', response.get_data(as_text=True))
        self.assertIn('id="huawei-model"', response.get_data(as_text=True))
        self.assertIn('value="dg8045"', response.get_data(as_text=True))
        self.assertIn('value="hg633"', response.get_data(as_text=True))

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

    def test_v1_decode_multipart(self):
        xml = b"<DB><entry>api</entry></DB>"
        encoded = encode_bytes(xml, {"payload_type": "0", "include_header": "false", "signature": ""})
        response = self.client.post(
            "/api/v1/decode",
            data={"file": (io.BytesIO(encoded), "config.bin")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])
        self.assertEqual(response.get_json()["xml"], xml.decode())

    def test_v1_decode_json_base64(self):
        xml = b"<DB><entry>json</entry></DB>"
        encoded = encode_bytes(xml, {"payload_type": "0", "include_header": "false", "signature": ""})
        response = self.client.post(
            "/api/v1/decode",
            json={"file_base64": base64.b64encode(encoded).decode(), "filename": "config.bin"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["xml"], xml.decode())

    def test_huawei_api_rejects_unsupported_model(self):
        response = self.client.post(
            "/api/v1/decode",
            data={
                "router_type": "huawei",
                "huawei_model": "unknown",
                "file": (io.BytesIO(b"not-a-huawei-config"), "config.bin"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("DG8045 أو HG633", response.get_json()["error"])

    def test_huawei_alias_exists(self):
        response = self.client.post(
            "/api/v1/huawei/decode",
            data={"file": (io.BytesIO(b"bad"), "config.bin")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("DG8045", response.get_json()["error"])

    def test_missing_file_is_rejected(self):
        response = self.client.post("/api/decode", data={})
        self.assertEqual(response.status_code, 400)
        self.assertIn("اختر ملف", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
