"use client";

import type { NextPage } from "next";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, isAddress, formatEther } from "viem";
import { useState, useEffect } from "react";
import deployedContracts from "../contracts/deployedContracts";
import { format } from "date-fns";

const Home: NextPage = () => {
  const { address: connectedAddress, isConnected } = useAccount();
  const { data: hash, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, isError } = useWaitForTransactionReceipt({ hash });
  const publicClient = usePublicClient();


  const [formResponder, setFormResponder] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");



  const [requests, setRequests] = useState([
    { id: 1, asker: "0x12345...", responder: "0x67890...", amount: "1 ETH", status: "Pending", description: "", createdAt: "2021-10-01 12:00:00" },
  ]);
  const [selectedList, setSelectedList] = useState("asker");

  const [isValid, setIsValid] = useState(true);

  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupAction, setPopupAction] = useState("");

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState(""); // 


  const [showCompletePopup, setShowCompletePopup] = useState(false);
  const [completeAmount, setCompleteAmount] = useState("");

  useEffect(() => {
    if (isConfirmed) {
      setLoadingMessage(null);
      setTimeout(() => setShowPopup(false), 2000);
    } else if (isError) {
      setLoadingMessage("Transaction failed. Please try again.");
    }
  }, [isConfirmed, isError]);

  useEffect(() => {
    const loadRequests = async () => {
      if (isConnected && connectedAddress) {
        console.log("Fetching requests for:", connectedAddress);
        await fetchRequests(connectedAddress); // ✅ Make sure fetchRequests exists
      }
    };
    loadRequests();
  }, [isConnected, connectedAddress]);

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

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    setPopupAction("Create"); // 
    setShowPopup(true);
    setLoadingMessage("Transaction submitted! Waiting for confirmation...");

    await writeContract({
      abi,
      address: ca,
      functionName: "createRequest",
      args: [formResponder, parseEther(formAmount), formDescription],
    });

    setFormResponder("");
    setFormAmount("");
    setFormDescription("");

    return;
  };


  const isFormValid = () => {
    if (!formResponder || !formAmount) return false;
    const amount = parseEther(formAmount);
    if (amount <= 0n) return false;
    if (formResponder.toLowerCase() === connectedAddress?.toLowerCase()) return false;
    return true;
  };

  const validateAddress = (addr: string) => {
    if (isAddress(addr)) {
      setIsValid(true);
    } else {
      setIsValid(false);
    }
  };





  const handleRejectRequest = async (id: number, desc: string) => {
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
        args: [BigInt(id), desc],
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
    description: string;
    createdAt: string;
  }



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
      }))].reverse();

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
              description: result[4],
              createdAt: format(new Date(Number(result[5]) * 1000), "yyyy-MM-dd HH:mm:ss"),
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


  const handleRejectPopup = (id: number) => {
    setSelectedRequestId(id);
    setShowRejectPopup(true);
  };

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) {
      alert("Please enter a reason before submitting.");
      return;
    }
    if (selectedRequestId !== null) {
      handleRejectRequest(selectedRequestId, rejectReason);
    }
    setShowRejectPopup(false);
    setRejectReason("");
  };

  const handleCompletePopup = (id: number, amount: string) => {
    setSelectedRequestId(id);
    setCompleteAmount(amount); // Default amount from request
    setShowCompletePopup(true);
  };

  const handleCompleteRequest = async () => {
    try {
      if (!connectedAddress || !selectedRequestId || parseFloat(completeAmount) <= 0) {
        alert("Please connect your wallet to complete the request.");
        return;
      }

      setShowCompletePopup(false); // Close popup


      setPopupAction("Complete"); // 
      setShowPopup(true);
      setLoadingMessage(`Completing request #${selectedRequestId}...`);

      return await writeContract({
        address: ca,
        abi,
        functionName: "completeRequest",
        args: [BigInt(selectedRequestId)], // Convert ID to BigInt
        value: parseEther(completeAmount), // Send the amount in ETH as msg.value
      });

    } catch (error) {
      console.error("failed to complete request: ", error);
      alert("failed to complete request");
      return;
    }
  };


  return (
    <div className="flex flex-col lg:flex-row justify-center items-stretch px-6 py-10 w-full min-h-[calc(100vh-150px)] space-y-6 lg:space-y-0 lg:space-x-6">
      {/* Form container (20% width) */}
      <div className="relative w-full lg:w-1/3 p-6 bg-white rounded-2xl shadow">
        <h2 className="text-base font-bold mb-4">Create a Request</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" htmlFor="responder-address">
            Payer Address:
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
          {!isValid && formResponder.length > 0 && <p style={{ color: "red" }}>invalid ethereum address!</p>}
          {connectedAddress && formResponder && formResponder.toLowerCase() === connectedAddress.toLowerCase() && (
            <p style={{ color: "red" }}>payer address should not be yourself</p>
          )}
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

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" htmlFor="request-description">
            Reason for Request:
          </label>
          <textarea
            id="request-description"
            value={formDescription}
            placeholder="Why do you want to request this payment?"
            maxLength={50}
            className="w-full px-3 py-2 border border-gray-300 rounded-3xl text-sm resize-none"
            rows={3}
            onChange={(e) => setFormDescription(e.target.value)}
          />
          {formDescription.length > 200 && (
            <p style={{ color: "red" }}>Description is too long (max 200 characters).</p>
          )}
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

              <div className="mt-4">
                <button
                  className="px-4 py-2 w-full rounded-lg text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                  onClick={() => setShowPopup(false)}
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Show status messages */}
        {/* {isConfirming && <div className="mt-2 text-sm text-yellow-500">Waiting for Confirmation...</div>}
        {isConfirmed && <div className="mt-2 text-sm text-green-500">Transaction Confirmed</div>} */}
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
                return request.responder.toLowerCase() === connectedAddress.toLowerCase();
              } else if (selectedList === "responder") {
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

                  {/* Description Field */}
                  {request.description && (
                    <p className="mt-1">
                      <strong>Description: </strong>
                      <span
                        className={`${request.status === "Completed"
                          ? "text-green-600"
                          : request.status === "Pending"
                            ? "text-yellow-600"
                            : "text-red-600"
                          }`}
                      >
                        {request.description}
                      </span>
                    </p>
                  )}

                  <p>
                    <strong>Created At:</strong> {request.createdAt}
                  </p>
                </div>

                {/* Only show buttons for Pending requests */}
                {selectedList === "asker" && request.status === "Pending" && (
                  <div className="flex space-x-3 pr-4">
                    <div>
                      <button
                        onClick={() => handleCompletePopup(request.id, request.amount)}
                        className="btn btn-sm bg-green-100 text-green-600"
                      >
                        Complete
                      </button>
                    </div>
                    <div>
                      <button
                        onClick={() => handleRejectPopup(request.id)}
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

        {showCompletePopup && (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-96 text-center relative">
              <h3 className="text-lg font-bold text-green-600">Complete Request</h3>
              <p className="text-gray-700 mt-2">Enter the amount you want to send:</p>

              {/* Amount Input Field */}
              <input
                type="text"
                className="w-full px-3 py-2 mt-3 border border-gray-300 rounded-md text-sm text-center"
                value={completeAmount}
                onChange={(e) => setCompleteAmount(e.target.value)}
              />

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <button
                  className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-300 text-gray-700 hover:bg-gray-400 transition-all"
                  onClick={() => setShowCompletePopup(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded-md text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-all"
                  onClick={() => handleCompleteRequest()}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {showRejectPopup && (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-96 text-center relative">

              <h3 className="text-lg font-bold text-gray-600">Do you want to reject?</h3>

              {/* Reason Input */}
              <textarea
                className="w-full p-2 border border-gray-300 rounded-lg mt-3 text-sm"
                rows={3}
                placeholder="Please enter a reason..."
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  setErrorMessage(e.target.value.length > 50 ? "Reason cannot exceed 50 characters." : "");
                }}

              ></textarea>
              {errorMessage && <p className="text-red-500 text-xs mt-1">{errorMessage}</p>}

              {/* Action Buttons */}
              <div className="flex justify-between mt-4">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                  onClick={() => setShowRejectPopup(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-all"
                  onClick={handleRejectSubmit}
                >
                  Submit
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div >
  );
};

export default Home;
