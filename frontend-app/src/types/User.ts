export type User = {
  id: string;
  email: string;
  isActive: boolean;
  isSuperuser: boolean;
  isVerified: boolean;
  username: string;
  oauth_accounts: {
    oauth_name: string;
    account_id: string;
    account_email: string;
  }[];
};
