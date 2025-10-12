import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { getToken } from '@/services/api/authentication';

export default function Main() {
  // States
  const [loggedIn, setLoggedIn] = useState<null | boolean>(null);

  // Effects
  useEffect(() => {
    getToken().then((token) => {
      if (token) {
        setLoggedIn(true);
      } else {
        setLoggedIn(false);
      }
    });
  }, []);

  // Sub Render >> Initializing, token check in progress
  if (loggedIn === null) {
    return null;
  }
  // Sub Render >> Not logged in -> redirect to login
  if (!loggedIn) {
    return <Redirect href={'/login'} />;
  }
  // Sub Render >> Logged in -> redirect to database
  return <Redirect href={'/database'} />;
}
