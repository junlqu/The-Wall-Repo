export const ANNOUNCEMENT_CONTAINER = "Announcements";

// Partition key: /announcementID. `id` mirrors announcementID (Cosmos requires
// an id).
export type Announcement = {
  id: string;
  announcementID: string;
  userID: string; // the author
  createdAt: string;
  title: string;
  announcement: string;
  // userIDs of everyone who liked it.
  likes: string[];
};
