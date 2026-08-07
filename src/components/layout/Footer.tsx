import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="py-4 border-t border-border mt-auto w-full">
      <div className="container mx-auto px-4 flex justify-center space-x-6 text-sm text-muted-foreground">
        <Link to="/privacy" className="hover:text-primary transition-colors">
          Privacy Policy
        </Link>
        <Link to="/terms" className="hover:text-primary transition-colors">
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}
