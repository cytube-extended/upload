export const fetchFile = async (url: string): Promise<File> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch url content: ${response.status}`);
  }

  const blob = await response.blob();
  const filename = new URL(url).pathname.split("/").pop() || "file";
  const file = new File([blob], filename, { type: blob.type });

  return file;
};
