export const upload = async (
  file: File,
  userhash?: string,
): Promise<string> => {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", file, file.name);
  if (userhash) {
    formData.append("userhash", userhash);
  }

  const response = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    headers: {
      "User-Agent": "CatBox/1.0",
    },
    body: formData,
  });

  const result = await response.text();

  if (!response.ok) {
    throw new Error(`catbox: upload failed: ${result}`);
  }

  if (!result.startsWith("http")) {
    throw new Error(`catbox: upload error: ${result}`);
  }

  return result;
};
