const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { exec, execSync } = require("child_process");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const { haveAccess } = require("./src/access");
const { getAllFiles } = require("./src/getFolder");
const { formatPathWithSpaces, resetTempFiles } = require("./src/utils");

const app = express();
const port = process.env.PORT || 3000;
dotenv.config({ path: "./.env" });

app.use(bodyParser.json({ limit: "10gb" }));

const ROOT = process.env.ROOT;
const FORBIDDEN_CARACS = ["|", "#", "\n", "\\"];
const TRANSACTION_TIMEOUT = 1_800_000; // 30 min

// Variables
let lastTouch = new Date().getTime();

let currentDevice = null;
let currentDeviceLastChange = new Date().getTime();

///
/// Begin transact
///
app.post("/beginTransaction", (req, res) => {
  try {
    const token = req.headers?.authorization?.split("Bearer ")[1] ?? " ";

    if (!haveAccess(token)) {
      res.statusCode = 401;
      res.end();
      return;
    }

    if (
      currentDevice != null &&
      currentDevice != token &&
      new Date().getTime() - currentDeviceLastChange <= TRANSACTION_TIMEOUT
    ) {
      res.statusCode = 409;
      res.end();
      return;
    }

    currentDevice = token;
    currentDeviceLastChange = new Date().getTime();

    res.statusCode = 200;
    res.end("Ok");
  } catch (err) {
    fs.writeFileSync("./lastError", "/beginTransaction " + err.toString());
    res.statusCode = 500;
    res.end();
  }
});

///
/// End transaction
///
app.post("/endTransaction", (req, res) => {
  try {
    const token = req.headers?.authorization?.split("Bearer ")[1] ?? " ";

    if (!haveAccess(token)) {
      res.statusCode = 401;
      res.end();
      return;
    }

    currentDevice = null;
    currentDeviceLastChange = new Date().getTime();

    res.statusCode = 200;
    res.end("Ok");
  } catch (err) {
    fs.writeFileSync("./lastError", "/endTransaction " + err.toString());
    res.statusCode = 500;
    res.end();
  }
});

///
/// Get last touch
///
app.get("/lastTouch", (req, res) => {
  try {
    const token = req.headers?.authorization?.split("Bearer ")[1] ?? " ";

    if (!haveAccess(token)) {
      res.statusCode = 401;
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");

    res.statusCode = 200;
    res.json({ lastTouch });
  } catch (err) {
    fs.writeFileSync("./lastError", "/lastTouch " + err.toString());
    res.statusCode = 500;
    res.end();
  }
});

///
///Create folders
///
app.put("/folder", async (req, res) => {
  try {
    const token = req.headers?.authorization?.split("Bearer ")[1] ?? " ";

    if (!haveAccess(token)) {
      res.statusCode = 401;
      res.end();
      return;
    }
    if (currentDevice != null && currentDevice != token) {
      res.statusCode = 409;
      res.end();
      return;
    }
    const body = req.body;

    if (!body.names) {
      res.statusCode = 400;
      res.end("Body must be of type : {names:[pathString]}");
      return;
    }

    if (
      body.names.filter(
        (name) => FORBIDDEN_CARACS.some((car) => name.includes(car)).length > 0
      )
    ) {
      res.statusCode = 400;
      res.end("One or many folders name aren't correct");
      return;
    }

    const errors = [];
    let createdFolders = 0;

    for (const folderName of body.names) {
      const folderNameFormatted = (
        folderName[0] == "/" ? folderName.substring(1) : folderName
      ).replaceAll(" ", "#");

      await new Promise((resolve) => {
        exec("mkdir " + ROOT + folderNameFormatted, (err, stdout, stderr) => {
          if (err != null) {
            errors.push(stderr);
          } else {
            createdFolders++;
          }
          resolve();
        });
      });
    }

    if (errors.length > 0) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.json({
        ...errors,
        createdFolders: createdFolders + "/" + body.names.length,
      });
      return;
    }

    res.statusCode = 200;
    res.json({
      createdFolders: createdFolders + "/" + body.names.length,
    });
  } catch (err) {
    fs.writeFileSync("./lastError", "put /folder " + err.toString());
    res.statusCode = 500;
    res.end();
  }
});

///
///Delete folders or files
///
app.delete("/file", async (req, res) => {
  try {
    const token = req.headers?.authorization?.split("Bearer ")[1] ?? " ";

    if (!haveAccess(token)) {
      res.statusCode = 401;
      res.end();
      return;
    }
    if (currentDevice != null && currentDevice != token) {
      res.statusCode = 409;
      res.end();
      return;
    }
    const body = req.body;

    if (!body.names || typeof body.names == "string") {
      res.statusCode = 400;
      res.end("Body must be of type : {names:[pathString];lastTouch:number}");
      return;
    }

    let deleted = 0;
    const errors = [];

    for (const fileName of body.names) {
      const fileNameFormatted = (
        fileName[0] == "/" ? fileName.substring(1) : fileName
      ).replaceAll(" ", "#");

      await new Promise((resolve) => {
        exec(
          "rm -rf " + ROOT + fileNameFormatted.replace(" ", "\\ "),
          (err, stdout, stderr) => {
            if (err != null) {
              errors.push(stderr);
            } else {
              deleted++;
            }
            resolve();
          }
        );
      });
    }
    // Delete empty directories
    exec(`find ${ROOT} -type d -empty -delete`);

    if (errors.length > 0) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.json({
        ...errors,
        deleted: deleted + "/" + body.names.length,
      });
      return;
    }

    res.statusCode = 200;
    res.json({
      deleted: deleted + "/" + body.names.length,
    });
  } catch (err) {
    fs.writeFileSync("./lastError", "delete /file " + err.toString());
    res.statusCode = 500;
    res.end();
  }
});

///
/// Get folder content recursively
///
app.post("/folder", (req, res) => {
  try {
    const token = req.headers?.authorization?.split("Bearer ")[1] ?? " ";

    if (!haveAccess(token)) {
      res.statusCode = 401;
      res.end();
      return;
    }

    if (currentDevice != null && currentDevice != token) {
      res.statusCode = 409;
      res.end();
      return;
    }
    const body = req.body;

    if (!body.name) {
      res.statusCode = 400;
      res.end(
        "Body must be of type : {name:pathString}, received :",
        body?.name
      );
      return;
    }

    res.setHeader("Content-Type", "application/json");
    // Run shell command

    try {
      const allFiles = getAllFiles(
        (ROOT + body.name.replaceAll(" ", "#")).replaceAll("//", "/"),
        []
      );

      res.statusCode = 200;
      res.json(allFiles);
    } catch (err) {
      fs.writeFileSync(
        "./lastError",
        "post /folder getAllFiles:" + err.toString()
      );
      res.statusCode = 500;
      res.end();
    }
  } catch (err) {
    fs.writeFileSync("./lastError", "post /folder :" + err.toString());
    res.statusCode = 500;
    res.end();
  }
});

///
///Create or update files
///
app.post(
  "/file-upload",
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/home/luc/Documents/Custom_Cloud/CloudEnv/",
  }),
  async (req, res) => {
    try {
      const token = req.headers?.authorization?.split("Bearer ")[1] ?? " ";

      if (!haveAccess(token)) {
        resetTempFiles(ROOT);

        res.statusCode = 401;
        res.end();
        return;
      }
      if (currentDevice != null && currentDevice != token) {
        resetTempFiles(ROOT);
        res.statusCode = 409;
        res.end();
        return;
      }

      const files = req.files;
      const location = req.body.location?.replaceAll(" ", "#");
      const bodyLastTouch = req.body.lastTouch;

      if (!files || location == null || bodyLastTouch == null) {
        resetTempFiles(ROOT);

        res.statusCode = 400;
        res.end(
          "Body must be of type : {location:pathString;lastTouch:number} and must have files"
        );
        return;
      }

      if (
        Object.values(files).filter((f) =>
          FORBIDDEN_CARACS.some((car) => f.name.includes(car))
        ).length > 0
      ) {
        resetTempFiles(ROOT);

        res.statusCode = 400;
        res.end("One or many files name are't correct");
        return;
      }

      const parentPath = (ROOT + location + "/").replaceAll("//", "/");

      const errors = [];
      let insertedFiles = 0;

      const lastTouchDate = new Date(parseInt(bodyLastTouch));

      // Create parent directory in case of doesn't exist
      execSync(`mkdir -p ${parentPath}`);

      for (const file of Object.values(files)) {
        const realName = file.name;

        const tempPath = formatPathWithSpaces(file.tempFilePath);
        const newPath = formatPathWithSpaces(parentPath + realName);

        await new Promise((resolve) => {
          exec(`mv ${tempPath} ${newPath}`, (err, _, stderr) => {
            fs.utimesSync(newPath, lastTouchDate, lastTouchDate);
            if (err == null) {
              insertedFiles += 1;
            } else {
              errors.push(stderr);
            }
            resolve();
          });
        });
      }
      if (errors.length > 0) {
        resetTempFiles(ROOT);

        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.json({
          ...errors,
          insertedFiles: insertedFiles + "/" + Object.keys(files).length,
        });
        return;
      }

      // Set lastTouch
      handleSetLastTouch(parseInt(bodyLastTouch));

      res.statusCode = 200;
      res.json({
        insertedFiles: insertedFiles + "/" + Object.keys(files).length,
      });

      return;
    } catch (err) {
      fs.writeFileSync("./lastError", "post /file-upload " + err.toString());
      res.statusCode = 500;
      res.end();
    }
  }
);

////
// Get file
////
app.post("/file-download", (req, res) => {
  try {
    const token = req.headers?.authorization?.split("Bearer ")[1] ?? " ";

    if (!haveAccess(token)) {
      res.statusCode = 401;
      res.end();
      return;
    }
    if (currentDevice != null && currentDevice != token) {
      res.statusCode = 409;
      res.end();
      return;
    }
    const body = req.body;

    if (!body.name) {
      res.statusCode = 400;
      res.end(
        "Body must be of type : {name:pathString}, received :" +
          JSON.stringify(body)
      );
      return;
    }

    const filePath = (ROOT + body.name).replaceAll(" ", "#");

    const fileStats = fs.statSync(filePath);

    res.statusMessage = Math.round(fileStats.mtime);
    res.sendFile(filePath);
  } catch (err) {
    fs.writeFileSync("./lastError", "post /file-download " + err.toString());
    res.statusCode = 500;
    res.end();
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

/// UTILS

function handleSetLastTouch(newTouch) {
  if (lastTouch < newTouch) {
    lastTouch = newTouch;
  }
}
