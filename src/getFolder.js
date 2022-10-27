const getFolder = (stdout) => {
  const ROOT = process.env.ROOT;

  const folders = stdout.split("\n\n");

  let result = [];
  folders.forEach((folder) => {
    const files = folder.split("\n");
    // 0 = folderName
    // 1 = total
    // rest = 1 line = 1 file or folder
    const [folderName, total] = files.splice(0, 2);

    files.forEach((file) => {
      if (file != "" && file.substring(0, 1) != "d") {
        // It's not directory, add it

        const splittedFile = file.split(" ").filter((f) => f != "");

        const date = splittedFile.filter((_, i) => i >= 5 && i < 7);
        const fileName = splittedFile.filter((_, i) => i >= 8).join(" ");

        const beginName = folderName.split(ROOT.replaceAll("\\", ""))[1];

        const absoluteName =
          beginName.substring(0, beginName.length - 1) + "/" + fileName;

        result.push({
          fileName:
            absoluteName[0] == "/" ? absoluteName.substring(1) : absoluteName,
          date: date.join("T"),
        });
      }
    });
  });
  return result;
};

module.exports = getFolder;
