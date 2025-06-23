import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";

const Header = () => {
  return (
    <nav className="navbar">
      <div className="grow">
        <div className="flex justify-between items-center h-20">
          {/* Logo à gauche */}
          <div className="flex-shrink-0">
            <Image 
              src="/logo.png" 
              alt="Logo" 
              width={300} 
              height={150}
              className="h-40 w-auto"
            />
          </div>
          
          {/* ConnectButton à droite */}
          <div className="flex items-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Header;