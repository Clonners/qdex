package main

import (
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/ethereum/go-ethereum/crypto"

	"github.com/QuaiChain/go-quai/common"
	"github.com/QuaiChain/go-quai/core/types"
	"github.com/QuaiChain/go-quai/params"

	"google.golang.org/protobuf/proto"
)

func main() {
	fmt.Println("=== QDEX Deploy Script (Go) ===\n")

	// Load private key from env
	pkStr := os.Getenv("DEPLOYER_PRIVATE_KEY")
	if pkStr == "" {
		log.Fatal("DEPLOYER_PRIVATE_KEY not set")
	}
	pkBytes, err := hex.DecodeString(pkStr[2:]) // strip 0x
	if err != nil {
		log.Fatal("Invalid private key:", err)
	}
	pk, err := crypto.ToECDSA(pkBytes)
	if err != nil {
		log.Fatal("Invalid ECDSA key:", err)
	}

	// Compute address
	addr := crypto.PubkeyToAddress(pk.PublicKey)
	fmt.Println("Deployer:", addr.Hex())

	// Load Settlement artifact
	artifactPath := filepath.Join("..", "contracts", "artifacts", "src", "Settlement.sol", "Settlement.json")
	data, err := os.ReadFile(artifactPath)
	if err != nil {
		log.Fatal("Cannot read artifact:", err)
	}

	var artifact struct {
		Bytecode string `json:"bytecode"`
	}
	if err := json.Unmarshal(data, &artifact); err != nil {
		log.Fatal("Cannot parse artifact:", err)
	}

	bytecode, err := hex.DecodeString(artifact.Bytecode[2:])
	if err != nil {
		log.Fatal("Invalid bytecode:", err)
	}

	fmt.Printf("Bytecode length: %d bytes\n\n", len(bytecode))

	// Get nonce from RPC
	nonce := getNonce(addr.Hex())
	fmt.Println("Nonce:", nonce)

	// Get gas price
	gasPrice := getGasPrice()
	fmt.Println("Gas price:", gasPrice)

	// Create QuaiTx
	chainID := big.NewInt(15000) // Orchard Cyprus1
	gasLimit := uint64(15000000)

	tx := &types.QuaiTx{
		ChainID:    chainID,
		Nonce:      nonce,
		GasPrice:   gasPrice,
		Gas:        gasLimit,
		To:         nil, // Contract creation
		Value:      big.NewInt(0),
		Data:       bytecode,
		AccessList: types.AccessList{},
		V:          new(big.Int),
		R:          new(big.Int),
		S:          new(big.Int),
	}

	// Create transaction
	txData := types.NewTx(tx)
	fmt.Println("Transaction created")

	// Sign transaction
	signer := types.LatestSignerForChainID(chainID, common.CYPRUS_1)
	signedTx, err := types.SignTx(txData, signer, pk)
	if err != nil {
		log.Fatal("Sign failed:", err)
	}

	fmt.Println("Signed successfully")
	fmt.Println("Tx hash:", signedTx.Hash().Hex())

	// Proto encode
	protoTx, err := signedTx.ProtoEncode()
	if err != nil {
		log.Fatal("ProtoEncode failed:", err)
	}

	protoData, err := proto.Marshal(protoTx)
	if err != nil {
		log.Fatal("Proto Marshal failed:", err)
	}

	hexData := hex.EncodeToString(protoData)
	fmt.Println("Proto encoded length:", len(protoData))
	fmt.Println("Hex preview:", hexData[:100], "...")

	// Save to file
	if err := os.WriteFile("signed_tx.hex", []byte(hexData), 0644); err != nil {
		log.Fatal("Cannot save:", err)
	}
	fmt.Println("\nSaved to signed_tx.hex")

	// Send via RPC
	fmt.Println("\nSending transaction...")
	txHash := sendTransaction(hexData)
	fmt.Println("\n✅ Tx sent!")
	fmt.Println("Tx Hash:", txHash)
	fmt.Println("Explorer: https://orchard.quaiscan.io/tx/" + txHash)
}

func getNonce(addr string) uint64 {
	result := rpcCall("eth_getTransactionCount", []interface{}{addr, "latest"})
	nonceHex := result.(string)
	nonce, _ := fmt.Sscanf(nonceHex, "0x%x")
	return uint64(nonce)
}

func getGasPrice() *big.Int {
	result := rpcCall("eth_gasPrice", nil)
	priceHex := result.(string)
	price, _ := new(big.Int).SetString(priceHex[2:], 16)
	return price
}

func rpcCall(method string, params []interface{}) interface{} {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
		"id":      1,
	}
	data, _ := json.Marshal(req)

	output, err := exec.Command("curl", "-s", "-m", "15", "-X", "POST",
		"https://orchard.rpc.quai.network/cyprus1",
		"-H", "Content-Type: application/json",
		"-d", string(data)).CombinedOutput()
	if err != nil {
		log.Fatal("RPC failed:", err, string(output))
	}

	var resp struct {
		Result json.RawMessage `json:"result"`
	}
	json.Unmarshal(output, &resp)
	var result interface{}
	json.Unmarshal(resp.Result, &result)
	return result
}

func sendTransaction(hexData string) string {
	params := []string{hexData}
	result := rpcCall("quai_sendRawTransaction", params)
	return result.(string)
}

// Suppress unused import warning
var _ = params.ProtocolVersion
