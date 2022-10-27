const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { exec } = require("child_process");
const fileUpload = require("express-fileupload");

const haveAccess = require("./src/access");
const getFolder = require("./src/getFolder");
const { formatPathWithSpaces, resetTempFiles } = require("./src/utils");

const app = express();
const port = process.env.PORT || 3000;
dotenv.config({ path: "./.env" });

const ROOT = process.env.ROOT;

app.use(bodyParser.json({ limit: "10gb" }));

const FORBIDDEN_CARACS = ["|", "\n", "\\"];

///
///Create folders
///
app.put("/folder", async (req, res) => {
  const token = req.headers?.authorization?.split("Bearer ")[1] ?? "";

  if (!haveAccess(token)) {
    res.statusCode = 401;
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
    const folderNameFormatted =
      folderName[0] == "/" ? folderName.substring(1) : folderName;

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
});

///
///Delete folders or files
///
app.delete("/file", async (req, res) => {
  const token = req.headers?.authorization?.split("Bearer ")[1] ?? "";

  if (!haveAccess(token)) {
    res.statusCode = 401;
    res.end();
    return;
  }
  const body = req.body;

  if (!body.names) {
    res.statusCode = 400;
    res.end("Body must be of type : {names:[pathString]}");
    return;
  }

  let deleted = 0;
  const errors = [];

  for (const fileName of body.names) {
    const fileNameFormatted =
      fileName[0] == "/" ? fileName.substring(1) : fileName;

    await new Promise((resolve) => {
      exec("rm -rf " + ROOT + fileNameFormatted, (err, stdout, stderr) => {
        if (err != null) {
          errors.push(stderr);
        } else {
          deleted++;
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
      deleted: deleted + "/" + body.names.length,
    });
    return;
  }

  res.statusCode = 200;
  res.json({
    deleted: deleted + "/" + body.names.length,
  });
});

///
/// Get folder content recursively
///
app.get("/folder", (req, res) => {
  const token = req.headers?.authorization?.split("Bearer ")[1] ?? "";

  if (!haveAccess(token)) {
    res.statusCode = 401;
    res.end();
    return;
  }
  const body = req.body;

  if (!body.name) {
    res.statusCode = 400;
    res.end("Body must be of type : {name:pathString}");
    return;
  }

  res.setHeader("Content-Type", "application/json");
  // Run shell command
  exec("ls -R -l --full-time " + ROOT + body.name, (err, stdout, stderr) => {
    if (err != null) {
      res.statusCode = 500;

      res.end(JSON.stringify({ error: stderr }));
      return;
    }
    const result = getFolder(stdout);

    res.statusCode = 200;
    res.json(result);
  });
});

///
///Create or update files
///
app.post(
  "/file",
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/home/luc/Documents/Custom Cloud/CloudEnv/",
  }),
  async (req, res) => {
    const token = req.headers?.authorization?.split("Bearer ")[1] ?? "";

    if (!haveAccess(token)) {
      resetTempFiles(ROOT);

      res.statusCode = 401;
      res.end();
      return;
    }

    const files = req.files;
    const location = req.body.location;

    if (!files || location == null) {
      resetTempFiles(ROOT);

      res.statusCode = 400;
      res.end(
        "Body must be of type : {location:pathString} and must have files"
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

    for (const file of Object.values(files)) {
      const realName = file.name;

      const tempPath = formatPathWithSpaces(file.tempFilePath);
      const newPath = formatPathWithSpaces(parentPath + realName);
      console.log("run :", `mv ${tempPath} ${newPath}`);
      await new Promise((resolve) => {
        exec(`mv ${tempPath} ${newPath}`, (err, _, stderr) => {
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

    res.statusCode = 200;
    res.json({
      insertedFiles: insertedFiles + "/" + Object.keys(files).length,
    });

    return;
  }
);

////
// Get file
////
app.get("/file", (req, res) => {
  const token = req.headers?.authorization?.split("Bearer ")[1] ?? "";

  if (!haveAccess(token)) {
    res.statusCode = 401;
    res.end();
    return;
  }
  const body = req.body;

  if (!body.name) {
    res.statusCode = 400;
    res.end("Body must be of type : {name:pathString}");
    return;
  }

  res.sendFile((ROOT + body.name).replaceAll("\\ ", " ").replaceAll("//", "/"));
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
