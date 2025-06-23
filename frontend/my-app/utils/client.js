import { createPublicClient, http } from "viem";
import { hardhat, sepolia } from 'viem/chains';

export const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(),
})

//On ne peut pas utiliser le useWatchContractEvent de Wagmi pour récupérer une liste d'evenement, pas pour le moment
// la doc nous conseil d'utiliser getLogs de Viem et c'est pour ça qu'on est obligé ici de créer notre client Viem