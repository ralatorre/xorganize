/**
 * Every selector the extension uses on x.com. These depend on the site's
 * markup, which changes without notice, so they live in one place.
 */
export const SELECTORS = {
  primaryColumn: '[data-testid="primaryColumn"]',
  post: 'article[data-testid="tweet"]',
  postText: '[data-testid="tweetText"]',
  postAuthor: '[data-testid="User-Name"]',
  postPermalinkTime: 'a[href*="/status/"] time[datetime]',
  postActionBar: 'article[data-testid="tweet"] [role="group"]',
  bookmarkButton: '[data-testid="bookmark"]',
  removeBookmarkButton: '[data-testid="removeBookmark"]',
  likeButton: '[data-testid="like"]',
  unlikeButton: '[data-testid="unlike"]',
  /** The link to the signed-in account's own profile, in X's sidebar. */
  profileLink: 'a[data-testid="AppTabBar_Profile_Link"]',
  /** X's account button, at the foot of its sidebar, with the account's avatar. */
  accountSwitcher: '[data-testid="SideNav_AccountSwitcher_Button"]',
} as const;

export type SelectorName = keyof typeof SELECTORS;
