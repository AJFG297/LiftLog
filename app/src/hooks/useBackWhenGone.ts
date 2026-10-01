import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/** Leaves the screen once what it shows no longer exists, such as a program removed from its own page. */
export function useBackWhenGone(gone: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (gone) {
      router.back();
    }
  }, [gone, router]);
}
