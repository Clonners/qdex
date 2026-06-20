package main

import (
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"os"
	"path/filepath"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/davecgh/go-spew/spew"

	"google.golang.org/protobuf/proto"

	"github.com/NethermindEth/juno/core/felt"

	"github.com/QuaiChain/go-quai/common"
	"github.com/QuaiChain/go-quai/core/types"
	"github.com/QuaiChain/go-quai/core/types/transaction_signing"
	"github.com/QuaiChain/go-quai/params"
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
	artifactPath := filepath.Join("contracts", "artifacts", "src", "Settlement.sol", "Settlement.json")
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

	fmt.Printf("Bytecode length: %d\n\n", len(bytecode))

	// Create QuaiTx
	chainID := big.NewInt(15000) // Orchard Cyprus1
	nonce := uint64(3)           // Current nonce
	gasPrice := big.NewInt(1200000000)
	gasLimit := uint64(15000000)

	tx := &types.QuaiTx{
		ChainID:  chainID,
		Nonce:    nonce,
		GasPrice: gasPrice,
		Gas:      gasLimit,
		To:       nil, // Contract creation
		Value:    big.NewInt(0),
		Data:     bytecode,
		AccessList: types.AccessList{},
		V:        new(big.Int),
		R:        new(big.Int),
		S:        new(big.Int),
	}

	// Create transaction
	txData := types.NewTx(tx)
	fmt.Println("Transaction created")

	// Sign transaction
	signer := transaction_signing.NewSigner(chainID, common.CYPRUS_1)
	signedTx, err := transaction_signing.SignTx(txData, signer, pk)
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

	data, err = proto.Marshal(protoTx)
	if err != nil {
		log.Fatal("Proto Marshal failed:", err)
	}

	hexData := hex.EncodeToString(data)
	fmt.Println("Proto encoded length:", len(data))
	fmt.Println("Hex preview:", hexData[:100], "...")

	// Save to file
	if err := os.WriteFile("signed_tx.hex", []byte(hexData), 0644); err != nil {
		log.Fatal("Cannot save:", err)
	}
	fmt.Println("\nSaved to signed_tx.hex")

	// Send via curl
	fmt.Println("\nSending transaction...")
	cmd := fmt.Sprintf(`curl -s -m 30 -X POST https://orchard.rpc.quai.network/cyprus1 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"quai_sendRawTransaction","params":["%s"],"id":1}'`, hexData)
	fmt.Println("Command:", cmd)

	// Execute
	output, err := exec.Command("bash", "-c", cmd).CombinedOutput()
	if err != nil {
		log.Fatal("Send failed:", err)
	}

	var result struct {
		Result common.Hash `json:"result"`
	}
	if err := json.Unmarshal(output, &result); err != nil {
		log.Fatal("Parse failed:", err)
	}

	fmt.Println("\n✅ Tx sent!")
	fmt.Println("Tx Hash:", result.Result.Hex())
	fmt.Println("Explorer: https://orchard.quaiscan.io/tx/" + result.Result.Hex())
}
