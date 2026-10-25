export const AVATAR_CONTAINER = "Avatars";

// Partition key: /userID. One avatar per user, so `id` mirrors userID (Cosmos
// requires an id) and uploading a new avatar replaces the document.
export type Avatar = {
  id: string;
  userID: string;
  // 128x128 image as a data URL ("data:image/webp;base64,..."), which carries
  // its own content type.
  avatar: string;
  updatedAt: string;
};
