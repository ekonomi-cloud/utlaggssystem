import Link from "next/link";
import { getSessionUser } from "@/lib/dal";
import { signOut } from "@/auth";

export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="site-header">
      <div className="inner">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Maskinteknologsektionen" />
          <span>Utlägg</span>
        </Link>
        <nav>
          {user ? (
            <>
              <Link href="/utlagg">Mina utlägg</Link>
              <Link href="/utlagg/nytt">Nytt utlägg</Link>
              {user.isTreasurer && <Link href="/admin">Kassör</Link>}
            </>
          ) : (
            <Link href="/login">Logga in</Link>
          )}
        </nav>
        {user && (
          <form
            className="user"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" referrerPolicy="no-referrer" />
            ) : null}
            <span className="small name">{user.name}</span>
            <button className="btn small ghost" type="submit">
              Logga ut
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
