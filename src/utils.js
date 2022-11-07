const { exec } = require("child_process");

function formatPathWithSpaces(path) {
  return path.replaceAll("\\ ", "#").replaceAll(" ", "#");
}

function resetTempFiles(root) {
  exec(`rm ${root}tmp-*`);
}

module.exports = { formatPathWithSpaces, resetTempFiles };
