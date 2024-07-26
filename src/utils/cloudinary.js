import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// Configure Cloudinary with environment variables for security
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  if (!localFilePath) return null;

  try {
    // Upload file to Cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    return response;
  } catch (err) {
    console.error("Cloudinary upload error:", err.message);
    throw new Error(`File upload failed: ${err.message}`);
  } finally {
    // Ensure file is deleted regardless of success or failure

    fs.unlinkSync(localFilePath);
  }
};

export { uploadOnCloudinary };
