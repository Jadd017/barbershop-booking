import { useEffect } from 'react';
import { useBranding, useShop } from '../hooks/useShop';
import { themeVariables } from '../lib/colors';

/**
 * Applies the shop's branding to every page: its colors replace the theme's charcoal, brass and
 * cream (src/index.css), and its name is the browser tab's title. Until the owner sets them, the
 * defaults stay. Renders nothing.
 */
export function ShopTheme() {
  const branding = useBranding();
  const { shop } = useShop();

  useEffect(() => {
    if (!branding) return;
    const root = document.documentElement;
    const variables = themeVariables(branding.colors);
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.colors.dark);
    return () => {
      for (const name of Object.keys(variables)) root.style.removeProperty(name);
    };
  }, [branding]);

  useEffect(() => {
    if (shop?.shopName) document.title = shop.shopName;
  }, [shop?.shopName]);

  return null;
}
