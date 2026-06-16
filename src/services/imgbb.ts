const endpoint = "https://api.imgbb.com/1/upload";
const userAgent = "ImgBB/1.0";

export const MAX_FILE_SIZE = 32 * 1024 * 1024;

type ImgBBResponse = {
  data: {
    id: string;
    title: string;
    url_viewer: string;
    url: string;
    display_url: string;
    width: string;
    height: string;
    size: string;
    time: string;
    expiration: string;
    image: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    thumb: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    medium: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    delete_url: string;
  };
  success: boolean;
  status: number;
};

const sendRequest = async (formData: FormData): Promise<Response> =>
  fetch(endpoint, {
    method: "POST",
    headers: { "User-Agent": userAgent },
    body: formData,
  });
const parseRequest = async (response: Response): Promise<ImgBBResponse> =>
  response.json<ImgBBResponse>();

const uploadImage = async (image: File | string, key: string) => {
  const formData = new FormData();
  formData.append("key", key);

  if (typeof image === "string") {
    formData.append("image", image);
  } else {
    formData.append("image", image, image.name);
  }

  const response = await sendRequest(formData);
  if (!response.ok) {
    throw new Error(`imgbb: upload failed: ${response.statusText}`);
  }

  const {
    success,
    data: { url },
  } = await parseRequest(response);
  if (!success) {
    throw new Error("imgbb: upload error");
  }

  return url;
};

export const uploadImageBlob = async (file: File, key: string) =>
  uploadImage(file, key);
export const uploadImageUrl = async (url: string, key: string) =>
  uploadImage(url, key);
export const uploadImageBase64 = async (base64: string, key: string) =>
  uploadImage(base64, key);
