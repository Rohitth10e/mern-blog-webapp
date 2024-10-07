const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const fs = require('fs');
const path = require('path');
const postSchema = require('./models/post');
const userModel = require("./models/user");

const app = express();
const port = 3000;
const salRound = 10;
const JWT_SECRET = "very123very@secret,69";

// Set up CORS
app.use(cors({
    credentials: true,
    origin: "http://localhost:5173",
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set up file upload
const upload = multer({ dest: 'uploads/' }); // Directory for uploaded files

// MongoDB connection
mongoose.connect("mongodb+srv://rohithes82:ADitRkAV7IPgwrBu@cluster0.dxmwg.mongodb.net/")
    .then(() => console.log("Connected to db"))
    .catch(err => console.log("Connection to db failed", err.message));

// Token authentication middleware
function authenticateToken(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ status: "error", message: "No token provided" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ status: "error", message: "Invalid token" });
        req.user = user; // Attach user info to request
        next();
    });
}

// User authentication function
async function authenticateUser(Inputusername, Inputpassword) {
    try {
        const foundUser = await userModel.findOne({ username: Inputusername });
        if (!foundUser) {
            return { success: false, message: "User not found" };
        }
        const matchPassword = await bcrypt.compare(Inputpassword, foundUser.password);
        if (matchPassword) {
            const token = jwt.sign(
                { id: foundUser._id, username: foundUser.username },
                JWT_SECRET,
                { expiresIn: "1h" }
            );
            return { success: true, message: "Login successful", token };
        } else {
            return { success: false, message: "Wrong password" };
        }
    } catch (err) {
        console.log("Error during Auth: ", err);
        return { success: false, message: "Error during login" };
    }
}

// Registration endpoint
app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await userModel.create({
            username,
            password: bcrypt.hashSync(password, salRound),
        });
        res.status(201).json(user);
    } catch (err) {
        console.log(err.message);
        res.status(400).json({ status: "failed", message: err.message });
    }
});

// Login endpoint
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const response = await authenticateUser(username, password);
        if (response.success) {
            res.cookie("token", response.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                maxAge: 3600000, // 1 hour
            });
            return res.json({ status: "ok", message: response.message });
        } else {
            // Send better error messages here
            return res.status(401).json({ status: "failed", message: response.message });
        }
    } catch (err) {
        console.error("Login Error:", err.message);
        res.status(500).json({ status: "error", message: "Internal server error" });
    }
});


// Profile endpoint
app.get("/profile", (req, res) => {
    const token = req.cookies.token;  // or req.headers.authorization
    if (!token) return res.status(401).json({ error: "No token, authentication denied" });

    jwt.verify(token, JWT_SECRET, (err, decodedToken) => {
        if (err) return res.status(403).json({ error: "Token is not valid" });

        // Assuming your token contains the user data like id and username
        res.json({ user: decodedToken });  // Send the decoded token wrapped in 'user'
    });
});


// Logout endpoint
app.post("/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ status: "ok", message: "Logged out successfully" });
});

// Create post endpoint
app.post("/create", upload.single('file'), async (req, res) => {
    const { title, summary, content } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ status: "error", message: "No file uploaded" });
    }

    const originalName = file.originalname;
    const parts = originalName.split('.');
    const ext = parts[parts.length - 1];

    // Define the new path for the uploaded file
    const newFileName = `${title.replace(/\s+/g, '_')}.${ext}`;
    const newPath = path.join(__dirname, 'uploads', newFileName);

    // Move the file to the new location
    fs.rename(file.path, newPath, async (err) => {
        if (err) {
            console.error("Error renaming file:", err);
            return res.status(500).json({ status: "error", message: "Failed to save the file" });
        }

        const { token } = req.cookies;
        jwt.verify(token, JWT_SECRET, {}, async (err, info) => {
            if (err) {
                console.error("Token verification failed:", err);
                return res.status(403).json({ status: "error", message: "Token verification failed" });
            }

            try {
                const postDoc = await postSchema.create({
                    title,
                    summary,
                    content,
                    file: newFileName,
                    author: info.id
                });
                res.json({ status: "ok", message: "Post created successfully!", post: postDoc });
            } catch (err) {
                console.error("Error creating post:", err);
                res.status(500).json({ status: "error", message: "Failed to create post" });
            }
        });
    });
});

// Get all posts endpoint
app.get("/post", async (req, res) => {
    try {
        const posts = await postSchema.find().populate('author', 'username').sort({ createdAt: -1 }).limit(20);
        res.json({ posts });
    } catch (err) {
        console.error("Error fetching posts:", err);
        res.status(500).json({ status: "error", message: "Failed to fetch posts" });
    }
});

app.get("/post/:id", async (req, res) => {
    try {
        const post = await postSchema.findOne({ _id: req.params.id }).populate('author')
        res.json({ post })
    } catch (err) {
        res.json({ message: "Error in getting the post", error: err.message })
    }
})

app.get("/edit/:id", authenticateToken, async (req, res) => {
    try {
        const post = await postSchema.findOne({ _id: req.params.id }).populate('author');
        res.json({ post });
    } catch (err) {
        res.json({ error: err.message });
    }
});



app.put("/edit/:id", authenticateToken, upload.single('file'), async (req, res) => {
    const { id } = req.params;  // Get the post ID from the request URL

    try {
        const { title, summary, content } = req.body;
        const file = req.file;

        let newFileName;
        if (file) {
            const originalName = file.originalname;
            const parts = originalName.split('.');
            const ext = parts[parts.length - 1];
            newFileName = `${title.replace(/\s+/g, '_')}.${ext}`;
            const newPath = path.join(__dirname, 'uploads', newFileName);

            try {
                await fs.promises.rename(file.path, newPath);
            } catch (err) {
                console.error("Error renaming file:", err);
                return res.status(500).json({ status: "error", message: "Failed to save the file" });
            }
        }

        const { token } = req.cookies;

        jwt.verify(token, JWT_SECRET, {}, async (err, info) => {
            if (err) {
                console.error("Token verification failed:", err);
                return res.status(403).json({ status: "error", message: "Token verification failed" });
            }

            try {
                const updateData = {
                    title,
                    summary,
                    content,
                    author: info.id
                };

                if (newFileName) {
                    updateData.file = newFileName;  // Only update the file if new one exists
                }

                const postDoc = await postSchema.findOneAndUpdate(
                    { _id: id },
                    updateData,
                    { new: true }  // Return the updated document
                );

                if (!postDoc) {
                    return res.status(404).json({ status: "error", message: "Post not found" });
                }

                res.json({ status: "ok", message: "Post updated successfully!", post: postDoc });
                console.log(postDoc);
            } catch (err) {
                console.error("Error updating post:", err);
                res.status(500).json({ status: "error", message: "Failed to update post" });
            }
        });
    } catch (err) {
        console.error("Error in edit route:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
});

app.get('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { token } = req.cookies;
        jwt.verify(token, JWT_SECRET, {}, async (err, info) => {
            if (err) {
                console.error("Token verification failed:", err);
                return res.status(403).json({ status: "error", message: "Token verification failed" });
            }
            try {
                const deletedPost = await postSchema.findOneAndDelete({ _id: id })
                if (!deletedPost) {
                    return res.status(404).json({ message: "Some error in delting the post", error: err.message, status:"ok" })
                } else {
                    return res.status(200).json({ message: "Post deleted successfully", deleted: deletedPost, status:"not ok" })
                }
            } catch (err) {
                console.error("Error in delete route:", err);
                return res.status(500).json({ status: "error", message: "Internal server error", error: err.message });
            }

        })
    } catch (err) {
        res.json({ error: err });
    }
})



// Root endpoint
app.get("/", (req, res) => {
    res.send("Hello");
});


// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
