import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (err) {
    throw new Error(500, "Error generating access and refresh token");
  }
};
const registerUser = asyncHandler(async (req, res) => {
  //get user details from frontend
  //validation-not empty
  //check if user already exists
  //check for images and avatar
  //upload them to cloudinary,avataar
  //create user object -create entry in db
  //remove pasword and refresh token field from reposne
  //check for user creation
  //return res
  const { fullName, email, username, password } = req.body;

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError("All fields are required", 400);
  }
  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }
  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;
  if (!avatarLocalPath) throw new ApiError(400, "Please upload an avatar");
  //upload on cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) throw new ApiError(400, "Please upload an avatar");

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken" //ye nahi chahiye
  );
  if (!createdUser)
    throw new ApiError(500, "Something went wrong while registering the user");

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  //req body->data
  //username or email
  //find the user
  //check password
  //access and refrsh token
  //send in cookies
  const { email, username, password } = req.body;

  if (!(username || email))
    throw new ApiError(400, "Please provide either username or email");
  const user = await User.findOne({ $or: [{ username }, { email }] });
  if (!user) throw new ApiError(404, "User doesnt exist");

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(401, "Invalid user credidentials");
  let { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  ); //ye nahi chahiye
  //options imp for cookies so user cant change them
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  //clear cookies
  //refresh refreh token
  await User.findByIdAndUpdate(
    req.user._id,
    { refreshToken: undefined },
    { new: true }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = User.findByIdAndUpdate(decodedToken?._id);
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }
    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is used");
    }
    const options = {
      httpOnly: true,
      secure: true,
    };
    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, newRefreshToken },
          "Access token refreshed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findByIdAndUpdate(req.user?.id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  if (!fullName || !email) {
    throw new ApiError(400, "Full name and email are required");
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) throw new ApiError(400, "Avtar file missing");
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  if (!avatar.url) {
    throw new ApiError(500, "Error uploading avatar to cloudinary");
  }
  const user = await User.findByIdAndUpdate(
    req.user?.id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverLocalPath = req.file?.path;
  if (!coverLocalPath) throw new ApiError(400, "Avtar file missing");
  const coverImage = await uploadOnCloudinary(avatarLocalPath);
  if (!coverImage.url) {
    throw new ApiError(500, "Error uploading cover image to cloudinary");
  }
  const user = await User.findByIdAndUpdate(
    req.user?.id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User cover image updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params; //as jo channel ki details chahiye uske url me jate he
  if (!username?.trim()) throw new ApiError(400, "Username is missing");
  //can use User.find({username}) but it is better to use $match field jo sare docs me ek doc find karlega
  //aggregrate pipeline returns array
  const channel = await User.aggregate([
    {
      $match: {
        username: username.trim().toLowerCase(),
      }, //now u have filtered a doc and u have so u can see his subscibers
    },
    {
      $lookup: {
        from: "subscriptions", // as Subscription converts to subscriptions
        localField: "_id",
        foreignField: "channel",
        as: "subscribers", //random name
      },
    },
    {
      $lookup: {
        from: "subscriptions", // as Subscription converts to subscriptions
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo", //random name
      },
    },
    //add both fields
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers", //count of subscribers
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo", //count of channels subscribed to
        },
        isSubscribed: {
          $cond: {
            if: {
              $in: [req.user?._id, "$subscribers.subscriber"], //search karko ki req.user ki id he subscribers field me uske subsciber me
            }, //jo doc aya he usme hu ya nahi
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        //sare cheeze ko nahi duga sirf selected cheeze jo project karna he
        fullName: 1, //jo jo fields bhejni he uske age 1 laga do
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);
  //in our case the returned array would have only 1 value as only one user
  if (condition?.length) throw new ApiError(404, "Channel not found");
  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregrate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
        //cant directly use req.user._id as it is not handled by mongoose by aggregration piplenine so convert it to   object id
      },
      //abhi tak user milgaya he
    },
    {
      $lookup: {
        from: "vidoes",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        //abhi tak many documents received and ek sub piple lagani padegi for single
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              //ab pura user agaya he
              pipeline: [
                {
                  //ye sab owner field me chala jayega
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            //can avoid this pipeline by just selectiong first element of arr by extra
            $addFields: {
              //us field ko owner hi bolre taki value override hogaye
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});
export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};
