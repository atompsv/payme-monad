"use client";

import type { NextPage } from "next";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, isAddress, formatEther } from "viem";
import { useState, useEffect } from "react";
import deployedContracts from "../contracts/deployedContracts";
import { format } from "date-fns";

const Home: NextPage = () => {
  const NETWORK_ID = process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || "20143";
  // const NETWORK_ID = "31337"; // foundry
  const CONTRACT_NAME = "Payme";

  const contractDetails =
    deployedContracts[NETWORK_ID as any as keyof typeof deployedContracts][CONTRACT_NAME];

  const ca = contractDetails?.address;
  const abi = contractDetails?.abi;
  if (!ca || !abi) {
    console.error("contract not properly configured");
    return <div>Error: Contract not properly configured.</div>;
  }

  const { address: connectedAddress, isConnected } = useAccount();
  const { data: hash, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, isError } = useWaitForTransactionReceipt({ hash });

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    setPopupAction("Create"); // 
    setShowPopup(true);
    setLoadingMessage("Transaction submitted! Waiting for confirmation...");

    await writeContract({
      abi,
      address: ca,
      functionName: "createRequest",
      args: [formResponder, parseEther(formAmount)],
    });

    setFormResponder("");
    setFormAmount("");

    return;
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

  const handleCompleteRequest = async (id: number, amount: string) => {
    try {
      if (!connectedAddress) {
        alert("Please connect your wallet to complete the request.");
        return;
      }

      setPopupAction("Complete"); // 
      setShowPopup(true);
      setLoadingMessage(`Completing request #${id}...`);

      // Write contract interaction
      writeContract({
        address: ca,
        abi,
        functionName: "completeRequest",
        args: [BigInt(id)], // Convert ID to BigInt
        value: parseEther(amount), // Send the amount in ETH as msg.value
      });
      return;
    } catch (error) {
      console.error("failed to complete request: ", error);
      alert("failed to complete request");
      return;
    }
  };

  const handleRejectRequest = async (id: number) => {
    try {
      if (!connectedAddress) {
        alert("Please connect your wallet to complete the request.");
        return;
      }

      setPopupAction("Reject");
      setShowPopup(true);
      setLoadingMessage(`Rejecting request #${id}...`);

      writeContract({
        address: ca,
        abi,
        functionName: "rejectRequest",
        args: [BigInt(id)],
      });
      return;
    } catch (error) {
      console.error("failed to reject the request: ", error);
      alert("failed to reject the request");
      return;
    }
  };

  interface Request {
    id: number;
    asker: string;
    responder: string;
    amount: string;
    status: string;
    createdAt: string;
  }

  const [requests, setRequests] = useState([
    { id: 1, asker: "0x12345...", responder: "0x67890...", amount: "1 ETH", status: "Pending", createdAt: "2021-10-01 12:00:00" },
  ]);
  const [selectedList, setSelectedList] = useState("asker");

  const publicClient = usePublicClient();
  const fetchRequests = async (userAddress: string) => {
    try {
      if (!publicClient || !userAddress) {
        console.error("Public client or connected address is undefined.");
        return;
      }

      const bills: bigint[] = [...(await publicClient.readContract({
        address: ca,
        abi,
        functionName: "getBillsByAddress",
        args: [userAddress],
      }))];

      const request = await Promise.all(
        bills.map(async (id) => {
          try {
            if (!id || id <= 0n) {
              return;
            }

            const result = await publicClient.readContract({
              address: ca,
              abi,
              functionName: "getRequestById",
              args: [id],
            });

            const statusMapping = ["Pending", "Completed", "Rejected"];
            return {
              id: Number(id),
              asker: result[0],
              responder: result[1],
              amount: formatEther(result[2]), // Convert wei to ETH
              status: statusMapping[Number(result[3])],
              createdAt: format(new Date(Number(result[4]) * 1000), "yyyy-MM-dd HH:mm:ss"),
            };
          } catch (error) {
            console.error(`Error fetching request for ID ${id}:`, error);
            return;
          }
        })
      );
      setRequests(request.filter((req): req is Request => req !== null));
      return;
    } catch (error) {
      console.error("Error fetching requests:", error);
      return;
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const handleRefresh = async () => {
    if (cooldown > 0) return;
    setIsRefreshing(true);
    await fetchRequests(connectedAddress || "");
    setIsRefreshing(false);
    setCooldown(10);

    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev === 1) {
          clearInterval(interval); // Stop timer at 0
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (isConfirmed) {
      setLoadingMessage(null);
      setTimeout(() => setShowPopup(false), 2000);
    } else if (isError) {
      setLoadingMessage("Transaction failed. Please try again.");
    }
  }, [isConfirmed, isError]);

  useEffect(() => {
    if (isConnected && connectedAddress) {
      fetchRequests(connectedAddress);
    }
  }, [isConnected, connectedAddress]);

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
            value={formResponder}
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
            value={formAmount}
            placeholder="e.g., 1 DMON"
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

              {/*Close button (X icon) positioned at top-right */}
              <button
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-xl"
                onClick={() => setShowPopup(false)}
              >
                x
              </button>

              {/* Popup Title */}
              <h3 className="text-lg font-bold text-blue-600">
                {popupAction === "Create" && "Processing Request..."}
                {popupAction === "Complete" && "Completing Request..."}
                {popupAction === "Reject" && "Rejecting Request..."}
              </h3>

              {/* Loading Message */}
              <p className="text-gray-700 mt-2">{loadingMessage}</p>

              {/* Transaction Status Messages */}
              {isConfirming && <p className="text-yellow-500 mt-2">Waiting for Confirmation...</p>}
              {isConfirmed && <p className="text-green-500 mt-2">Transaction Confirmed ✅</p>}
              {isError && <p className="text-red-500 mt-2">Transaction Failed ❌</p>}

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

          <div className="flex space-x-2">
            <button
              onClick={() => setSelectedList("asker")}
              className={`px-6 text-sm btn-sm btn ${selectedList === "asker" ? "btn-primary text-white" : "border border-gray-300"
                }`}
            >
              View Incoming Requests
            </button>

            <button
              onClick={() => setSelectedList("responder")}
              className={`px-6 text-sm btn-sm btn ${selectedList === "responder" ? "btn-primary text-white" : "border border-gray-300"
                }`}
            >
              View My Sent Requests
            </button>

            {/*Refresh Button (Closer to Sent Requests) */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || cooldown > 0}
              className="btn btn-sm btn-outline border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              {isRefreshing ? "🔄 Refreshing..." : cooldown > 0 ? `⏳ Wait ${cooldown}s` : "🔄"}
            </button>
          </div>

        </div>


        <div className="space-y-4">
          {requests
            .filter((request) => {
              if (!connectedAddress) return false; // Skip filtering if connectedAddress is undefined

              if (selectedList === "asker") {
                // Show requests where the asker is the connected address
                return request.responder.toLowerCase() === connectedAddress.toLowerCase();
              } else if (selectedList === "responder") {
                // Show requests where the responder is the connected address
                return request.asker.toLowerCase() === connectedAddress.toLowerCase();
              }
              return false;
            })
            .map((request) => (
              <div
                key={request.id}
                className="flex flex-row items-center justify-between p-4 border rounded-lg bg-gray-50"
              >
                <div className="text-sm">
                  <p>
                    <strong>Address:</strong>{" "}
                    {selectedList === "asker" ? request.asker : request.responder}
                  </p>
                  <p>
                    <strong>Amount:</strong> {request.amount} DMON
                  </p>
                  <p>
                    <strong>Status:</strong>{" "}
                    <span
                      className={`px-2 py-1 rounded font-bold ${request.status === "Completed"
                        ? "bg-green-100 text-green-600"
                        : request.status === "Pending"
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-red-100 text-red-600"
                        }`}
                    >
                      {request.status}
                    </span>
                  </p>

                  <p>
                    <strong>Created At:</strong> {request.createdAt}
                  </p>
                </div>
                {/* Only show buttons for Pending requests */}
                {selectedList === "asker" && request.status === "Pending" && (
                  <div className="flex space-x-3 pr-4">
                    <div>
                      <button
                        onClick={() => handleCompleteRequest(request.id, request.amount)}
                        className="btn btn-sm bg-green-100 text-green-600"
                      >
                        Complete
                      </button>
                    </div>
                    <div>
                      <button
                        onClick={() => handleRejectRequest(request.id)}
                        className="btn btn-sm bg-red-100 text-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div >
  );
};

export default Home;
