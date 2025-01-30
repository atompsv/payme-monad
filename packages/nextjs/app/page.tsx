"use client";

import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, isAddress } from "viem";
import { useState, } from "react";
import deployedContracts from "../contracts/deployedContracts";


const Home: NextPage = () => {
  const NETWORK_ID = process.env.NEXT_FOUNDRY_CHAIN_ID || "31337";
  const CONTRACT_NAME = "Payme";

  const contractDetails =
    deployedContracts[NETWORK_ID as any as keyof typeof deployedContracts][CONTRACT_NAME];

  const ca = contractDetails?.address;
  const abi = contractDetails?.abi;
  if (!ca || !abi) {
    console.error("contract not properly configured");
    return <div>Error: Contract not properly configured.</div>;
  }

  const { address: connectedAddress } = useAccount();
  const { data: hash, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, isError } = useWaitForTransactionReceipt({ hash });

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    setPopupAction("Create"); // 
    setShowPopup(true);
    setLoadingMessage("Transaction submitted! Waiting for confirmation...");

    writeContract({
      abi,
      address: ca,
      functionName: "createRequest",
      args: [formResponder, parseEther(formAmount)],
    });
  };

  const [formResponder, setFormResponder] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const isFormValid = () => {
    if (!formResponder || !formAmount) return false;
    const amount = parseEther(formAmount);
    if (amount <= 0n) return false;
    if (formResponder.toLowerCase() === connectedAddress?.toLowerCase()) return false;
    return true;
  };

  const [isValid, setIsValid] = useState(true);
  const validateAddress = (addr: string) => {
    if (isAddress(addr)) {
      setIsValid(true);
    } else {
      setIsValid(false);
    }
  };

  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupAction, setPopupAction] = useState("");

  return (
    <div className="flex flex-col lg:flex-row justify-center items-stretch px-6 py-10 w-full min-h-[calc(100vh-150px)] space-y-6 lg:space-y-0 lg:space-x-6">
      {/* Form container (20% width) */}
      <div className="relative w-full lg:w-1/3 p-6 bg-white rounded-2xl shadow">
        <h2 className="text-base font-bold mb-4">Create a Request</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" htmlFor="responder-address">
            Responder Address:
          </label>
          <input
            id="responder-address"
            type="text"
            placeholder="0xAddress"
            className="w-full px-3 py-2 border border-gray-300 rounded-3xl text-sm overflow-x-auto"
            style={{ wordBreak: "break-all" }}
            onChange={(e) => {
              setFormResponder(e.target.value);
              validateAddress(e.target.value);
            }}
          />
          {!isValid && formResponder.length > 0 && <p style={{ color: "red" }}>Invalid ethereum address!</p>}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" htmlFor="amount">
            Amount:
          </label>
          <input
            id="amount"
            type="text"
            placeholder="e.g., 1 ETH"
            className="w-full px-3 py-2 border border-gray-300 rounded-3xl text-sm"
            onChange={(e) => setFormAmount(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary w-full text-bold text-white"
          onClick={handleCreateRequest}
          disabled={isPending || isConfirming || !isFormValid()}
        >
          {isPending ? "Confirming..." : "Create"}
        </button>

        {/*Show transaction hash */}
        {/* {hash && <div className="mt-2 text-sm text-gray-500">Tx Hash: {hash}</div>} */}

        {/* Show loading popup */}
        {showPopup && (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-96 text-center relative">

              <button
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                onClick={() => setShowPopup(false)}
              >
              </button>

              <h3 className="text-lg font-bold text-blue-600">
                {popupAction === "Create" && "Processing Request..."}
                {popupAction === "Complete" && "Completing Request..."}
                {popupAction === "Reject" && "Rejecting Request..."}
              </h3>

              <p className="text-gray-700 mt-2">{loadingMessage}</p>

              {isConfirming && <p className="text-yellow-500 mt-2">Waiting for Confirmation...</p>}
              {isConfirmed && <p className="text-green-500 mt-2">Transaction Confirmed ✅</p>}
              {isError && <p className="text-red-500 mt-2">Transaction Failed ❌</p>}

              <button
                className="mt-4 px-4 py-2 rounded-lg rounded-2xl text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                onClick={() => setShowPopup(false)}
              >
                Close
              </button>

            </div>
          </div>
        )}

        {/* Show status messages */}
        {/* {isConfirming && <div className="mt-2 text-sm text-yellow-500">Waiting for Confirmation...</div>}
        {isConfirmed && <div className="mt-2 text-sm text-green-500">Transaction Confirmed ✅</div>} */}
      </div>

      {/* Request list container (80% width) */}
      <div className="flex flex-col w-full lg:w-2/3 p-6 bg-white rounded-2xl shadow space-y-2 max-h-[600px] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold">Requests</h2>
        </div>
      </div>
    </div >
  );
};

export default Home;
