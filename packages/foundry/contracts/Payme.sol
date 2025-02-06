// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Payme {
    event RequestCreated(uint requestId, address indexed asker, address indexed responder, uint amount);
    event RequestUpdated(uint requestId, address indexed asker, address indexed responder, uint amount, uint8 status);

    enum Status {Pending, Completed, Rejected}

    struct Request {
        uint id;
        address asker;
        address responder;
        uint amount;
        uint8 status;
        uint256 createdAt;
    }

    uint public nextId = 1;
    mapping (uint => Request) requestInfo;
    mapping(address => uint[]) public billsByAddress;

    function createRequest(address responder, uint amount) public {
        require(amount > 0, "amount should be greater zero");
        require(responder != msg.sender, "can't request to yourself");

        uint id = nextId;
        requestInfo[id] = Request({
            id : id,
            asker : msg.sender,
            responder : responder,
            amount : amount,
            status : uint8(Status.Pending),
            createdAt: block.timestamp
        });

        billsByAddress[msg.sender].push(id);
        billsByAddress[responder].push(id);

        nextId++;

        // emit
       emit RequestCreated(id, msg.sender, responder, amount);
    }

    function completeRequest(uint id) public payable   {
        require(id > 0  && id < nextId, "invalid request id");

        Request storage request = requestInfo[id];
        require(request.responder == msg.sender, "permission denied");
        require(request.status == uint8(Status.Pending) || request.status == uint8(Status.Rejected), "request is not peding or already completed");
        require(msg.value == request.amount, "mismatch amount");

        payable(request.asker).transfer(msg.value);
        request.status = uint8(Status.Completed);

        // emit
        emit  RequestUpdated(request.id, request.asker, request.responder, request.amount, request.status);
    }


    function rejectRequest(uint id) public {
        require(id > 0  && id < nextId, "invalid request id");

        Request storage request = requestInfo[id];
        require(request.responder == msg.sender, "permission denied");
        require(request.status == uint8(Status.Pending) || request.status == uint8(Status.Completed), "request is not pending or already rejected");

        request.status = uint8(Status.Rejected);

        // emit
        emit  RequestUpdated(request.id, request.asker, request.responder, request.amount, request.status);
    }


    function getRequestById(uint id) public  view returns (address asker, address responder, uint amount, uint8 status,uint256 createdAt){
        require(id > 0  && id < nextId, "invalid request id");
        return (requestInfo[id].asker, requestInfo[id].responder, requestInfo[id].amount, requestInfo[id].status, requestInfo[id].createdAt);
    }

    function getBillsByAddress(address user) public view returns (uint[] memory) {
        return billsByAddress[user];
    }

}