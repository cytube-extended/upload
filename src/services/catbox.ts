const endpoint = "https://catbox.moe/user/api.php";
const userAgent = "CatBox/1.0";

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
export const MAX_GIF_SIZE = 200 * 1024 * 1024; // 20MB

const sendRequest = async (formData: FormData): Promise<Response> =>
  fetch(endpoint, {
    method: "POST",
    headers: { "User-Agent": userAgent },
    body: formData,
  });
const parseRequest = async (response: Response): Promise<string> =>
  response.text();

export const uploadBlob = async (
  file: File,
  userhash?: string,
): Promise<string> => {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", file, file.name);
  if (userhash) {
    formData.append("userhash", userhash);
  }

  const response = await sendRequest(formData);
  if (!response.ok) {
    throw new Error(`catbox: upload failed: ${response.statusText}`);
  }

  const result = await parseRequest(response);
  if (!result.startsWith("http")) {
    throw new Error(`catbox: upload error: ${result}`);
  }

  return result;
};

export const uploadUrl = async (
  url: string,
  userhash?: string,
): Promise<string> => {
  const formData = new FormData();
  formData.append("reqtype", "urlupload");
  formData.append("url", url);
  if (userhash) {
    formData.append("userhash", userhash);
  }

  const response = await sendRequest(formData);
  if (!response.ok) {
    throw new Error(`catbox: upload failed: ${response.statusText}`);
  }

  const result = await parseRequest(response);
  if (!result.startsWith("http")) {
    throw new Error(`catbox: upload error: ${result}`);
  }

  return result;
};
