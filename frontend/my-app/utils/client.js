import { createPublicClient, http } from "viem";
import { sepolia } from 'viem/chains';

const RPC = process.env.NEXT_PUBLIC_INFURA_RPC || "";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC),
})

//On ne peut pas utiliser le useWatchContractEvent de Wagmi pour récupérer une liste d'evenement, pas pour le moment
// la doc nous conseil d'utiliser getLogs de Viem et c'est pour ça qu'on est obligé ici de créer notre client Viem