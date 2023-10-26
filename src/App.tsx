import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ParticleNetwork } from '@particle-network/auth';
import { ParticleProvider } from '@particle-network/provider';

import { createPublicClient, createClient, http } from 'viem';
import { getAccountNonce, getUserOperationHash, bundlerActions } from 'permissionless';
import { pimlicoBundlerActions, pimlicoPaymasterActions } from 'permissionless/actions/pimlico';

import { SmartAccount } from '@particle-network/aa';

import { goerli } from 'viem/chains';
import { notification } from 'antd';

import './App.css';

const App = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [ethBalance, setEthBalance] = useState(null);
  const [smartAccount, setSmartAccount] = useState(null);
  const [isDeployed, setIsDeployed] = useState(null);

  const config = {
    projectId: process.env.REACT_APP_PROJECT_ID,
    clientKey: process.env.REACT_APP_CLIENT_KEY,
    appId: process.env.REACT_APP_APP_ID,
  };

  const particle = new ParticleNetwork({
    ...config,
    chainName: 'ethereum',
    chainId: 5,
    wallet: { displayWalletEntry: true },
  });

  const smartAccountBiconomy = new SmartAccount(new ParticleProvider(particle.auth), {
    ...config,
    aaOptions: {
      biconomy: [{ chainId: 5, version: '1.0.0' }],
    }
  });

  particle.setERC4337({
    name: "BICONOMY",
    version: "1.0.0"
  });

  const provider = new ethers.providers.Web3Provider(new ParticleProvider(particle.auth));

  useEffect(() => {
    const fetchAccountInfo = async () => {
      const smartAcc = await smartAccountBiconomy.getAddress();
      setSmartAccount(smartAcc);

      const balance = ethers.utils.formatEther(await provider.getBalance(smartAcc));
      setEthBalance(balance);

      setIsDeployed(await smartAccountBiconomy.isDeployed());
    };

    if (userInfo) fetchAccountInfo();
  }, [userInfo]);

  const deployAccount = async () => {
    if (!(await smartAccountBiconomy.isDeployed())) await smartAccountBiconomy.deployWalletContract();
  }

  const handleLogin = async (preferredAuthType) => {
    const user = await particle.auth.login({ preferredAuthType });
    setUserInfo(user);
  };

  const executeUserOp = async () => {
    const signer = provider.getSigner();
    const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

    const publicClient = createPublicClient({
      transport: http(process.env.REACT_APP_RPC_URL),
      chain: goerli
    });

    const bundlerClient = createClient({
      transport: http(`https://api.pimlico.io/v1/goerli/rpc?apikey=${process.env.REACT_APP_PIMLICO_KEY}`),
      chain: goerli
    }).extend(bundlerActions).extend(pimlicoBundlerActions);

    const paymasterClient = createClient({
      transport: http(`https://api.pimlico.io/v2/goerli/rpc?apikey=${process.env.REACT_APP_PIMLICO_KEY}`),
      chain: goerli
    }).extend(pimlicoPaymasterActions);

    const [nonce, gasPrice] = await Promise.all([
      getAccountNonce(publicClient, { address: smartAccount, entryPoint }),
      bundlerClient.getUserOperationGasPrice()
    ]);

    const account = new ethers.utils.Interface(["function executeCall(address to, uint256 value, bytes data)"]);
    const callData = account.encodeFunctionData("executeCall", ["0x000000000000000000000000000000000000dEaD", ethers.utils.parseUnits('0.001', 'ether'), "0x"]);

    let userOperation = {
      sender: smartAccount,
      nonce,
      initCode: "0x",
      callData,
      maxFeePerGas: gasPrice.fast.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.fast.maxPriorityFeePerGas,
      signature: "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
    };

    const sponsorResult = await paymasterClient.sponsorUserOperation({ userOperation, entryPoint });

    userOperation = { ...userOperation, ...sponsorResult };

    const userOperationHash = getUserOperationHash({ userOperation, chainId: 5, entryPoint });

    userOperation.signature = await signer.signMessage(ethers.utils.arrayify(userOperationHash));

    const userOperationHashResult = await bundlerClient.sendUserOperation({ userOperation, entryPoint });

    notification.success({
      message: "User operation successful",
      description: `Hash: ${userOperationHashResult}`
    });
  };

  return (
      <div className="App">
        <div className="logo-section">
          <img src="https://i.imgur.com/EerK7MS.png" alt="Logo 1" className="logo logo-big"/>
          <img src="https://i.imgur.com/YbaX0Eb.png" alt="Logo 2" className="logo"/>
        </div>
        {!userInfo ? (
          <div className="login-section">
            <button className="sign-button" onClick={() => handleLogin('google')}>Sign in with Google</button>
            <button className="sign-button" onClick={() => handleLogin('twitter')}>Sign in with Twitter</button>
          </div>
        ) : (
          <div className="profile-card">
            <h2>{userInfo.name}</h2>
            <div className="avax-balance-section">
              <small>{ethBalance} ETH</small>
              {isDeployed ? (
                <button className="sign-message-button" onClick={executeUserOp}>Execute User Operation</button>
              ) : (
                <button className="sign-message-button" onClick={deployAccount}>Deploy Account</button>
              )}
            </div>
          </div>
        )}
    </div>
  );
};

export default App;