import multer from "multer";
import crypto from "crypto";
import path from "path";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/temp");
  },
  filename: function (req, file, cb) {
    crypto.randomBytes(12, (err, buf) => {
      if (err) {
        cb(err);
        return;
      }
      const filename = buf.toString("hex") + path.extname(file.originalname);
      cb(null, filename);
    });
  },
});

export const upload = multer({ storage: storage });
