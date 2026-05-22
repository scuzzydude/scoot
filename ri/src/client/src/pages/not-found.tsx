import { Link } from "wouter";
import { Button } from "../components/ui/button.js";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-6xl font-bold text-white/20">404</p>
      <p className="text-white/60">Page not found</p>
      <Link href="/">
        <Button variant="outline">Go home</Button>
      </Link>
    </div>
  );
}
