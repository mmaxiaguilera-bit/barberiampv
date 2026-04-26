import logo from "@/assets/mvp-logo.png";

export const Logo = ({ size = 40, withText = false }: { size?: number; withText?: boolean }) => (
  <div className="flex items-center gap-3">
    <img src={logo} alt="MVP Barber" width={size} height={size} style={{ width: size, height: size }} />
    {withText && (
      <div className="leading-tight">
        <div className="font-serif text-lg text-foreground">MVP Barber</div>
        <div className="text-[10px] text-muted-foreground tracking-luxury uppercase">Premium Studio</div>
      </div>
    )}
  </div>
);
