const fs = require("fs");
const path = require("path");

function getAllFiles(dirPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      const fileName = path.join(dirPath, "/", file);
      arrayOfFiles.push({
        fileName: fileName.split(process.env.ROOT)[1].replaceAll("#", " "),
        lastDate: getFileLastDate(fileName),
      });
    }
  });
  return arrayOfFiles;
}

function getFileLastDate(filePath) {
  const stats = fs.statSync(filePath);
  return Math.round(stats.mtime);
}

module.exports = { getAllFiles };
