import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import { ClipLoader } from "react-spinners"
import Select from 'react-select'

import './styles/FaucetForm.css'
import ReCaptcha from './ReCaptcha'
import FooterBox from './FooterBox'
import queryString from 'query-string'
import { DropdownOption } from './types'
import { connectAccount } from './Metamask'
import { AxiosResponse } from 'axios'

const FaucetForm = (props: any) => {
    const [chain, setChain] = useState<number | null>(null)
    const [token, setToken] = useState<number | null>(null)
    const [widgetID, setwidgetID] = useState<string | undefined>(undefined)
    const [recaptcha, setRecaptcha] = useState<ReCaptcha | undefined>(undefined)
    const [isV2, setIsV2] = useState<boolean>(false)
    const [chainConfigs, setChainConfigs] = useState<any>([])
    const [inputAddress, setInputAddress] = useState<string>("")
    const [address, setAddress] = useState<string | null>(null)
    const [faucetAddress, setFaucetAddress] = useState<string | null>(null)
    const [options, setOptions] = useState<DropdownOption[]>([])
    const [tokenOptions, setTokenOptions] = useState<DropdownOption[]>([]);
    const [balance, setBalance] = useState<string>("0")
    const [shouldAllowSend, setShouldAllowSend] = useState<boolean>(false)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [isFetchingBalance, setIsFetchingBalance] = useState<AbortController | null>(null)
    const [sendTokenResponse, setSendTokenResponse] = useState<any>({
        txHash: null,
        message: null
    })

    const [iconsVisible, setIconsVisible] = useState<boolean>(false)
    const [inputFocused, setInputFocused] = useState<boolean>(false)
    const barChartRef = useRef<HTMLDivElement>(null)
    const [barChartVisible, setBarChartVisible] = useState<boolean>(false)

    // Animate broker → arrow → fey icons on mount
    useEffect(() => {
        const t = setTimeout(() => setIconsVisible(true), 120)
        return () => clearTimeout(t)
    }, [])

    // Trigger bar chart animation when scrolled into view
    useEffect(() => {
        const el = barChartRef.current
        if (!el) return
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setBarChartVisible(true); observer.disconnect() } },
            { threshold: 0.2 }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    // Update chain configs
    useEffect(() => {
        setRecaptcha(new ReCaptcha(
            props.config.SITE_KEY,
            props.config.ACTION,
            props.config.V2_SITE_KEY,
            setwidgetID,
            widgetID
        ))
        updateChainConfigs()
        connectAccount(updateAddress, false)

    }, [])

    // Update balance whenver chain changes or after transaction is processed
    useEffect(() => {
        updateBalance()
    }, [chain, token, sendTokenResponse, chainConfigs])

    // Make REQUEST button disabled if either address is not valid or balance is low
    useEffect(() => {
        if(address) {
            if(BigInt(balance) > calculateBaseUnit(chainConfigs[token!]?.DRIP_AMOUNT, chainConfigs[token!]?.DECIMALS)) {
                setShouldAllowSend(true)
                return
            }
        }
        
        setShouldAllowSend(false)
    }, [address, balance])

    useEffect(() => {
        updateFaucetAddress()
    }, [chain, chainConfigs])

    useEffect(() => {
        let newOptions: DropdownOption[] = []
        
        chainConfigs?.forEach((chain: any, i: number) => {
            let item = <div className='select-dropdown'>
                <img alt = { chain.NAME[0] } src = { chain.IMAGE } />
                { chain.NAME }

                {
                    chain.CONTRACTADDRESS &&
                    <span style={{color: 'rgb(180, 180, 183)', fontSize: "10px", marginLeft: "5px"}}>
                        {
                            chainConfigs[chainToIndex(chain.HOSTID) || 0]?.NAME
                        }
                    </span>
                }
            </div>

            if(!chain.CONTRACTADDRESS) {
                newOptions.push({
                    label: item,
                    value: i,
                    search: chain.NAME
                })
            }
        })
        
        setOptions(newOptions)
        setChain(newOptions[0]?.value)
    }, [chainConfigs])

    useEffect(() => {
        let newOptions: DropdownOption[] = []
        
        chainConfigs?.forEach((chain: any, i: number) => {
            const { chain: ch } = getChainParams();

            let item = <div className='select-dropdown'>
                <img alt = { chain.NAME[0] } src = { chain.IMAGE } />
                { chain.ID == ch ? chain.TOKEN : chain.NAME }

                <span style={{color: 'rgb(180, 180, 183)', fontSize: "10px", marginLeft: "5px"}}>
                    {
                        chain.CONTRACTADDRESS ?
                        "ERC20" :
                        "Native"
                    }
                </span>
            </div>

            if((chain.CONTRACTADDRESS && chain.HOSTID == ch) || chain.ID == ch) {
                newOptions.push({
                    label: item,
                    value: i,
                    search: chain.NAME
                })
            }
        })

        setTokenOptions(newOptions)
        setToken(newOptions[0]?.value)
    }, [chainConfigs, chain])

    const getConfigByTokenAndNetwork = (token: any, network: any): number => {
        let selectedConfig = 0;

        try {
            token = token?.toUpperCase();
            network = network?.toUpperCase();
            
            chainConfigs.forEach((chain: any, i: number): any => {
                if(chain.TOKEN == token && chain.HOSTID == network) {
                    selectedConfig = i;
                }
            })
        } catch(err: any) {
            console.log(err)
        }

        return selectedConfig;
    }

    let totalTokens: boolean = tokenOptions?.length === 0;

    useEffect(() => {
        const query = queryString.parse(window.location.search)
        
        const { address, subnet, erc20 } = query

        const tokenIndex: number = getConfigByTokenAndNetwork(erc20, subnet)
        
        if(typeof address == "string") {
            updateAddress(address)
        }

        if(typeof subnet == "string") {
            setChain(chainToIndex(subnet))
            if(typeof erc20 == "string") {
                setToken(tokenIndex)
            }
        } else {
            setChain(0)
        }
    }, [window.location.search, options, totalTokens])

    // API calls
    async function updateChainConfigs(): Promise<void> {
        const response: AxiosResponse = await props.axios.get(
            props.config.api.getChainConfigs
        )
        setChainConfigs(response?.data?.configs)
    }

    function getChainParams(): {chain: string, erc20: string} {
        let params = {
            chain: chainConfigs[chain!]?.ID,
            erc20: chainConfigs[token!]?.ID
        }

        return params
    }

    async function updateBalance(): Promise<void> {
        // Abort pending requests
        const controller = new AbortController();
        if(isFetchingBalance) {
            isFetchingBalance.abort()
        }
        setIsFetchingBalance(controller)

        if((chain || chain == 0) && chainConfigs.length > 0) {
            let { chain, erc20 } = getChainParams()
            
            try {
                const response: AxiosResponse = await props.axios.get(props.config.api.getBalance, {
                    params: {
                        chain,
                        erc20
                    },
                    signal: controller.signal
                })
            
                if(response?.data?.balance || response?.data?.balance == 0) {
                    setBalance(response?.data?.balance)
                }
            } catch (err: any) {
                // Silently ignore intentional cancellations (superseded by a newer request)
                if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
                    return
                }
                throw err
            }
        }
    }

    async function updateFaucetAddress(): Promise<void> {
        if((chain || chain == 0) && chainConfigs.length > 0) {
            let { chain } = getChainParams()
            
            const response: AxiosResponse = await props.axios.get(props.config.api.faucetAddress, {
                params: {
                    chain
                }
            })
            
            if(response?.data) {
                setFaucetAddress(response?.data?.address)
            }
        }
    }

    function calculateBaseUnit(amount: string = "0", decimals: number = 18): BigInt {
        for(let i = 0; i < decimals; i++) {
            amount += "0"
        }
        return BigInt(amount)
    }

    function calculateLargestUnit(amount: string = "0", decimals: number = 18): string {
        let base = "1"
        for(let i = 0; i < decimals; i++) {
            base += "0"
        }
        return (BigInt(amount) / BigInt(base)).toString()
    }

    function chainToIndex(id: any): number | null {
        if(chainConfigs?.length > 0) {
            if(typeof id == "string") {
                id = id.toUpperCase()
            }
            let index: number = 0
            chainConfigs.forEach((chain: any, i: number) => {
                if(id == chain.ID) {
                    index = i
                }
            })
            return index
        } else {
            return null
        }
    }

    function updateAddress(addr: any): void {
        setInputAddress(addr!)
        
        if (addr) {
            if (ethers.utils.isAddress(addr)) {
                setAddress(addr)
            } else {
                setAddress(null)
            }
        } else if (address != null) {
            setAddress(null)
        }
    }

    async function getCaptchaToken(): Promise<{token?:string, v2Token?: string}> {
        const { token, v2Token } = await recaptcha!.getToken(isV2)
        return { token, v2Token }
    }

    function updateChain(option: any): void {
        let chainNum: number = option.value
        
        if(chainNum >= 0 &&  chainNum < chainConfigs.length) {
            setChain(chainNum)
            back()
        }
    }

    function updateToken(option: any): void {
        let tokenNum: number = option.value
        
        if(tokenNum >= 0 &&  tokenNum < chainConfigs.length) {
            setToken(tokenNum)
            back()
        }
    }

    async function sendToken(): Promise<void> {
        if(!shouldAllowSend) {
            return
        } 
        let data: any
        try {
            setIsLoading(true)

            const { token, v2Token } = await getCaptchaToken()

            let { chain, erc20 } = getChainParams()

            const response = await props.axios.post(props.config.api.sendToken, {
                address,
                token,
                v2Token,
                chain,
                erc20
            })
            data = response?.data
        } catch(err: any) {
            data = err?.response?.data || err
        }

        if(typeof data?.message == "string") {
            if(data.message.includes("Captcha verification failed")) {
                setIsV2(true)
                !isV2 && recaptcha?.loadV2Captcha(props.config.V2_SITE_KEY);
            }
        } 

        setSendTokenResponse({
            txHash: data?.txHash,
            message: data?.message
        })

        setIsLoading(false)
    }

    const getOptionByValue = (value: any): DropdownOption => {
        let selectedOption: DropdownOption = options[0]
        options.forEach((option: DropdownOption): void => {
            if(option.value == value) {
                selectedOption = option
            }
        })
        return selectedOption
    }

    const getTokenOptionByValue = (value: any): DropdownOption => {
        let selectedOption: DropdownOption = tokenOptions[0]
        tokenOptions.forEach((option: DropdownOption): void => {
            if(option.value == value) {
                selectedOption = option
            }
        })
        return selectedOption
    }

    const customStyles = {
        control: (base: any, state: { isFocused: any }) => ({
            ...base,
            background: "rgba(38, 39, 47, 0.5)",
            borderRadius: state.isFocused ? "5px 5px 0 0" : 5,
            height: "48px",
            borderColor: state.isFocused ? "rgb(49 51 67 / 50%)" : "rgba(38, 39, 47, 0.5)",
            boxShadow: null,
            "&:hover": {
                borderColor: "rgb(59 62 84 / 83%)"
            }
        }),
        menu: (base: any) => ({
            ...base,
            borderRadius: 0,
            marginTop: 0,
            background: "rgb(45, 45, 45)",
            color: "white"
        }),
        menuList: (base: any) => ({
            ...base,
            padding: 0,
            "::-webkit-scrollbar": {
                width: "2px"
            },
            "::-webkit-scrollbar-track": {
                background: "black"
            },
            "::-webkit-scrollbar-thumb": {
                background: "#888"
            },
            "::-webkit-scrollbar-thumb:hover": {
                background: "#555"
            }
        }),
        option: (styles: any, {isFocused, isSelected}: any) => ({
            ...styles,
            background: isFocused
                    ?
                    'black'
                    :
                    isSelected
                    ?
                    '#333'
                    :
                    undefined,
            zIndex: 1
        }),
        input: (base: any) => ({
            ...base,
            color: "white"
        }),
        singleValue: (base: any) => ({
            ...base,
            color: "white"
        })
    }

    const ChainDropdown = () => (
        <div style={{width: "100%", marginTop: "5px"}}>
            <Select
                options={options}
                value={getOptionByValue(chain)}
                onChange={updateChain}
                styles={customStyles}
                getOptionValue ={(option: any)=>option.search}
            />
        </div>
    )

    const TokenDropdown = () => (
        <div style={{width: "100%", marginTop: "5px"}}>
            <Select
                options={tokenOptions}
                value={getTokenOptionByValue(token)}
                onChange={updateToken}
                styles={customStyles}
                getOptionValue ={(option: any)=>option.search}
            />
        </div>
    )

    const resetRecaptcha = (): void => {
        setIsV2(false)
        recaptcha!.resetV2Captcha()
    }

    const back = (): void => {
        resetRecaptcha()
        setSendTokenResponse({
            txHash: null,
            message: null
        })
    }

    const toString = (mins: number): string => {
        if(mins < 60) {
            return `${mins} minute${mins > 1 ? 's' : ''}`
        } else {
            const hour = ~~(mins / 60)
            const minute = mins % 60

            if(minute == 0) {
                return `${hour} hour${hour > 1 ? 's' : ''}`
            } else {
                return `${hour} hour${hour > 1 ? 's' : ''} and ${minute} minute${minute > 1 ? 's' : ''}`
            }
        }
    }

    return (
        <><div className="app">
            <div id="__next">
                <nav className="custom-fkg4yz efh2cxx5">
                    <a aria-label="Go home" href="../index.html">
   <svg
      width={138}
      height={38}
      viewBox="0 0 138 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M110.064 9.448v1.776c0 .401-.018.684-.055.847-.036.146-.155.264-.355.356-.182.09-.501.136-.956.136h-3.388c-.565 0-.847.328-.847.984V25.95c0 .638-.091 1.048-.273 1.23-.164.182-.501.273-1.011.273h-1.804c-.473 0-.81-.1-1.011-.3-.182-.201-.273-.602-.273-1.203V13.52c0-.638-.319-.957-.956-.957h-3.06c-.729 0-1.175-.082-1.339-.246-.164-.164-.246-.555-.246-1.175v-1.53c0-.746.456-1.12 1.366-1.12h13.088c.746 0 1.12.319 1.12.956zM91.655 24.503v1.803c0 .492-.118.81-.355.957-.237.145-.692.218-1.366.218H79.907c-.692 0-1.166-.146-1.421-.437-.237-.291-.355-.838-.355-1.64V10.378c0-.71.136-1.202.41-1.475.273-.291.801-.437 1.584-.437h10c.547 0 .93.1 1.148.3.237.183.355.483.355.902v1.694c0 .492-.11.82-.328.984-.2.145-.592.218-1.175.218h-6.803c-.346 0-.592.046-.738.137-.127.09-.19.273-.19.546v1.776c0 .51.3.765.9.765h4.973c.583 0 .966.082 1.148.246.2.146.3.474.3.984v1.721c0 .474-.09.783-.273.929-.182.127-.574.191-1.175.191h-4.89c-.365 0-.62.073-.765.219-.146.127-.219.355-.219.683l.027 1.64c0 .4.046.664.137.792.11.109.373.164.792.164h6.804c.6 0 1.001.072 1.202.218.2.146.3.455.3.93zM74.358 23.11c.145.254.21.5.191.737-.018.219-.146.492-.383.82-.746 1.02-1.812 1.83-3.196 2.431-1.385.602-2.66.902-3.825.902-2.896 0-5.228-.938-6.995-2.814-1.767-1.895-2.65-4.29-2.65-7.186 0-2.841.865-5.219 2.596-7.131C61.844 8.956 64.13 8 66.953 8c1.203 0 2.368.2 3.498.601 1.129.4 2.04.993 2.732 1.776.601.674.874 1.302.82 1.885-.019.255-.255.601-.71 1.038-.438.42-.802.702-1.094.848-.291.164-.537.245-.737.245-.183-.018-.42-.145-.71-.382a4.462 4.462 0 00-.301-.246 1.85 1.85 0 00-.328-.246 2.44 2.44 0 00-.328-.246 1.202 1.202 0 00-.383-.246 14.158 14.158 0 00-.382-.218 1.931 1.931 0 00-.465-.191 3.03 3.03 0 00-.519-.137 2.936 2.936 0 00-.6-.11 7.278 7.278 0 00-.656-.027c-1.512 0-2.724.574-3.634 1.722-.911 1.129-1.366 2.44-1.366 3.934 0 1.512.446 2.85 1.338 4.016.911 1.166 2.113 1.749 3.607 1.749.692 0 1.33-.11 1.912-.328.583-.237 1.002-.455 1.257-.656.273-.218.61-.528 1.011-.928.437-.438.792-.675 1.066-.71.273-.056.674.127 1.202.546.127.109.346.355.656.737.31.365.482.592.519.683zM53.806 10.13v9.81c0 2.458-.72 4.39-2.159 5.792-1.439 1.384-3.397 2.076-5.874 2.076-5.355 0-8.033-2.64-8.033-7.923V10.13c0-.656.073-1.075.219-1.257.164-.182.492-.273.983-.273h2.077c.455 0 .756.118.901.355.146.237.22.628.22 1.175v9.918c0 1.165.309 2.058.928 2.677.62.601 1.521.902 2.705.902 1.093 0 1.976-.319 2.65-.956.692-.638 1.038-1.494 1.038-2.569v-9.972c0-.693.073-1.12.219-1.285.146-.163.5-.245 1.066-.245h1.857c.474 0 .793.118.957.355.164.218.246.61.246 1.175zM26.977 19.694l-1.23-2.486c-.109-.237-.218-.383-.327-.437-.092-.055-.173-.046-.246.027-.073.073-.164.219-.273.437l-1.148 2.404c-.273.529-.137.793.41.793h2.459c.473 0 .592-.246.355-.738zm7.869 6.803c.109.42.09.683-.055.793-.146.109-.419.164-.82.164l-2.568.027c-.382 0-.646-.055-.792-.164-.128-.11-.264-.319-.41-.628l-.137-.3c-.073-.201-.164-.402-.273-.602-.09-.2-.155-.319-.191-.355-.31-.601-.71-.902-1.202-.902H22.55c-.674 0-1.12.228-1.339.683-.036.018-.155.255-.355.71-.2.438-.31.656-.328.656-.2.383-.41.629-.628.738-.2.091-.574.137-1.12.137h-2.05c-.382 0-.646-.073-.792-.219-.146-.164-.155-.446-.027-.847.054-.219.136-.437.245-.656l8.334-16.721c.6-1.22 1.202-1.22 1.803 0l8.278 16.694c.146.383.237.647.274.792zM16.88 9.776v1.558c0 .564-.146.929-.438 1.093-.291.164-.765.246-1.42.246H7.809c-.219 0-.328.173-.328.519v1.748c0 .037-.01.11-.027.219v.191c.018.037.036.082.054.137.018.054.046.09.082.11a.711.711 0 00.219.026h5.054c.346 0 .592.01.738.028.164.018.346.073.546.164.2.072.337.218.41.437.091.2.137.473.137.82v1.557c0 .62-.137 1.02-.41 1.202-.273.164-.747.246-1.42.246H7.808c-.237 0-.356.21-.356.628v5.246c0 1.002-.519 1.503-1.557 1.503H4.53c-.565 0-.965-.118-1.202-.355-.219-.237-.328-.62-.328-1.148V10.733c0-.875.127-1.458.383-1.749.273-.291.837-.437 1.693-.437H15.568c.091 0 .246.018.465.055.236.036.391.1.464.19a.932.932 0 01.246.356c.091.164.137.373.137.628z"
        fill="#fff"
      />
    </svg>
                    </a>
                    <nav className="custom-1rohuv9 efh2cxx4">
                        <div className="custom-z5evu9 efh2cxx2" />
     <svg
      aria-hidden="true"
      width="18px"
      height="18px"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 6.75V8.5m0 0a3.5 3.5 0 100 7m0-7c1.116 0 2.11.522 2.75 1.335M12 15.5v1.75m0-1.75c1.116 0 2.11-.522 2.75-1.335M21.25 12a9.25 9.25 0 11-18.5 0 9.25 9.25 0 0118.5 0z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
                            Faucet balance: <span className="bal">{calculateLargestUnit(balance, chainConfigs[token!]?.DECIMALS)} {chainConfigs[token!]?.TOKEN}</span>
                    </nav>
                </nav>
                <section className="custom-8wnnp0 e1qs7i8x4">
                    <div
  style={{ opacity: 1, transition: "opacity 0.6s" }}
  className="custom-13cp8x2 e1qs7i8x1"
>
  <img
    style={{ objectFit: "cover", width: "100%" }}
    className="e1qs7i8x0 custom-1f084u9 e1obyj9s0"
    src="images/texture_4x-dd4a2f3708a6d06ef814ed4e2a240953.jpg"
    alt="Background texture"
    loading="eager"
  />
</div>
                    <div className="e1qs7i8x7 custom-13ofgpf e1eopxg20">
                        <div
                            style={{ position: "relative", zIndex: 1 }}
                            className="custom-397u3s e1qs7i8x2"
                        >
                            <div className="custom-ams46q e1qs7i8x5">
                                <div className="custom-1wnowod e1ppejf22">
                                    <img
                                        style={{ opacity: iconsVisible ? 1 : 0, transform: iconsVisible ? 'translateX(0px)' : 'translateX(8px)' }}
                                        className="e1ppejf20 custom-2blqlt e1obyj9s0"
                                        src="images/djt-faucet.png"
                                        alt="E*Trade icon"
                                        loading="eager" />
                                    <div style={{ opacity: iconsVisible ? 1 : 0 }} className="custom-v2j4ih e1ppejf21">
                                        <svg
                                            width={22}
                                            height={23}
                                            viewBox="0 0 22 23"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                clipRule="evenodd"
                                                d="M16.4071 16.1869H5.19679C4.81695 16.1869 4.50903 15.885 4.50903 15.5126C4.50903 15.1401 4.81695 14.8382 5.19679 14.8382H14.5846L12.033 12.6465C11.7463 12.4006 11.717 11.9734 11.9677 11.6922C12.2184 11.411 12.6541 11.3823 12.9409 11.6282L16.8679 15C17.0823 15.1854 17.1574 15.4815 17.0565 15.7438C16.9557 16.0061 16.6999 16.1798 16.414 16.1802L16.4071 16.1869ZM12.8859 19.4242L13.9588 18.6486C14.2645 18.427 14.3292 18.0043 14.1032 17.7045C13.8772 17.4047 13.4461 17.3413 13.1403 17.5629L12.0675 18.3384C11.7617 18.56 11.697 18.9827 11.923 19.2826C12.149 19.5824 12.5801 19.6458 12.8859 19.4242V19.4242ZM9.63974 11.2327C9.89006 10.9533 9.86237 10.5279 9.57784 10.282L7.02628 8.09074H16.4141C16.7939 8.09074 17.1019 7.78888 17.1019 7.41651C17.1019 7.04414 16.7939 6.74228 16.4141 6.74228H5.19686C4.91101 6.74268 4.65522 6.91638 4.55434 7.17859C4.45347 7.44079 4.52856 7.73683 4.74295 7.92218L8.67001 11.2933C8.95501 11.5387 9.38888 11.5116 9.63974 11.2327V11.2327ZM8.91056 5.124L9.59831 4.5509C9.88508 4.30514 9.91434 3.878 9.66364 3.59686C9.41295 3.31573 8.97725 3.28705 8.69048 3.53281L8.00272 4.10591C7.71595 4.35167 7.6867 4.77881 7.93739 5.05994C8.18808 5.34108 8.62378 5.36976 8.91056 5.124Z"
                                                fill="white" />
                                        </svg>
                                    </div>
                                    <img
                                        style={{ opacity: iconsVisible ? 1 : 0, transform: iconsVisible ? 'translateX(0px)' : 'translateX(-8px)' }}
                                        className="e1ppejf20 custom-2blqlt e1obyj9s0"
                                        src="./images/djt-chains.png"
                                        alt="Fey icon"
                                        loading="eager" />
                                </div>
                            </div>
                            <h1 className="custom-r5h420 eq5xoa73">
                                Welcome to Dijets{" "}
                                <span className="custom-10uj70j e1n77l7y0">Faucet{/* */}.</span>
                            </h1>
                            <p className="custom-6792g ex8xpf41">
                                Get into the markets with E*Trade. Own your finances, analyze your
                                performance and have more control by linking your accounts to Fey, all
                                in a beautiful UI.
                            </p>
                        </div>
                        <div className="custom-pyj6uh e1qs7i8x3">
                            <div className="custom-gm9qv7 e1h53kak18">
                                <div className="custom-109jdny e1h53kak14">
                                    <div
                                        style={{
                                            background: "linear-gradient(180deg, rgba(0, 160, 223, 0.14) 0%, rgba(0, 140, 203, 0.14) 100%)"
                                        }}
                                        className="custom-1lfr11m e1h53kak13" />
                                    <div className="custom-1v7mt5h e1h53kak15">
                                        <div className="custom-1wnowod e1ppejf22">
                                            <img
                                                style={{ opacity: iconsVisible ? 1 : 0, transform: iconsVisible ? 'translateX(0px)' : 'translateX(8px)' }}
                                                className="e1ppejf20 custom-2blqlt e1obyj9s0"
                                                src="images/djt-faucet.png"
                                                alt="E*Trade icon"
                                                loading="eager" />
                                            <div style={{ opacity: iconsVisible ? 1 : 0 }} className="custom-v2j4ih e1ppejf21">
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19.262 20.25v-4h-4M4.75 3.75v4h4"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.814 10.969A8.25 8.25 0 0012 20.25 8.393 8.393 0 0018.632 17M20.186 13.031A8.25 8.25 0 0012 3.75 8.393 8.393 0 005.366 7"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
                                            </div>
                                            <img
                                                style={{ opacity: iconsVisible ? 1 : 0, transform: iconsVisible ? 'translateX(0px)' : 'translateX(-8px)' }}
                                                className="e1ppejf20 custom-2blqlt e1obyj9s0"
                                                src="images/djt-chains.png"
                                                alt="Nodebook icon"
                                                loading="eager" />
                                        </div>
                                    </div>
                                    <h2 className="custom-1f4h5pu e1h53kak17">Connect Nodebook to Get Started</h2>
                                    <p>
                                        By getting access, you’ll be able to connect and sync your
                                        accounts.
                                    </p>
                                </div>
                                <div className="custom-1ktim7m e1h53kak12" />
                                <div className="custom-1w7ocyc e1h53kak16">
                                    <img
                                        src="lappy.png"
                                        alt="Laptop with Dijets Faucet"
                                        loading="lazy"
                                        className="laps" />
                                </div>
                                <div className="custom-27hezv e1h53kak11">
                                    <div>
                                        <div className='box-header'>
                            <TokenDropdown />
                        </div>
                        <br />
                                        <div className="custom-ld9q1c erwllwf4">
                                            <input
                                                tabIndex={-1}
                                                style={{
                                                    opacity: 0,
                                                    height: 0,
                                                    width: 0,
                                                    position: "absolute"
                                                }}
                                                aria-hidden="true" />
                                            <input
                                                value={inputAddress || ""}
                                                onChange={(e) => updateAddress(e.target.value)}
                                                onFocus={() => setInputFocused(true)}
                                                onBlur={() => setInputFocused(false)}
                                                autoComplete="Off"
                                                className="custom-hgw6ws erwllwf1" />
                                            <span className="custom-1obke9i erwllwf2">
                                                <label htmlFor="email" className={`custom-1yl8jmf erwllwf3${(inputFocused || !!inputAddress) ? ' erwllwf3--active' : ''}`}>
                                                    Utility Chain Address
                                                </label>
                                            </span>
                                            <div className="custom-1iwbho6 erwllwf0" onClick={() => connectAccount(updateAddress)}>
                                                <img className="nodebook-img" alt='nodebook' src="/connect-nodebook.png" />
                                                Connect
                                            </div>
                                        </div>
                                        <br />
                                        
                                    </div>
                                    <div className='v2-recaptcha' style={{ marginTop: "10px", display: "none" }}></div>
                                <button className={shouldAllowSend ? 'custom-15pc524 ebptsmc0' : 'custom-15pc524-disabled'} onClick={sendToken}>
                                    {isLoading?
                                        <ClipLoader size="20px" speedMultiplier={0.3} color="403F40" />
                                        :
                                        <span>Request {chainConfigs[token || 0]?.DRIP_AMOUNT} {chainConfigs[token || 0]?.TOKEN}</span>}
                                </button>
                            <div style={{ display: sendTokenResponse?.txHash ? "flex" : "none", alignItems: "center", gap: "10px", justifyContent: "center" }}>
                                    {sendTokenResponse?.message && (
                                        <p style={{ color: sendTokenResponse?.txHash ? "rgb(42 202 144)" : "#ff6b6b", fontSize: "16px", marginTop: "24px", fontWeight: 600 }}>
                                            {sendTokenResponse.message}
                                        </p>
                                    )}
                                        <a
                                            target={'_blank'}
                                            className="explorer-link"
                                            href={chainConfigs[token!]?.EXPLORER + '/tx/' + sendTokenResponse?.txHash}
                                            rel="noreferrer"
                                        >
                                    <span className='bold-text'>View in Explorer</span>   <svg
      width={20}
      height={20}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.397 7.71c.536-.195 1.103.163 1.2.725.08.455-.18.896-.596 1.098A8.265 8.265 0 1022.274 20.07c.18-.444.62-.743 1.096-.687.58.068.977.627.8 1.183-.44 1.37-1.114 2.569-2.255 3.71-4.034 4.034-10.575 4.034-14.61 0-4.034-4.035-4.034-10.576 0-14.61.996-.997 1.951-1.543 3.092-1.957zm11.971 7.07a1.127 1.127 0 002.253-.005L24.606 8.1a1.127 1.127 0 00-1.124-1.124l-6.676-.015a1.127 1.127 0 00-.005 2.253l3.965.009-5.695 5.695a1.127 1.127 0 001.593 1.593l5.695-5.695.01 3.965z"
        fill="#fff"
      />
    </svg></a>
                                    <p className='rate-limit-texter'>
                                        <a
                                            target={'_blank'}
                                            href={chainConfigs[token!]?.EXPLORER + '/tx/' + sendTokenResponse?.txHash}
                                            rel="noreferrer"
                                        >
                                            {sendTokenResponse?.txHash}
                                        </a>
                                    </p>
                                    </div>
                                 <div className="ratta"><button className='' onClick={back}>Request another drop</button></div>
                                </div>
                            </div>
                        </div>
                        <div className="custom-1romztm e1qs7i8x6">
                            <div className="custom-begm7t e1dk6hnl2">
                                <div className="custom-1lj776s e1dk6hnl1" />
                                <div className="custom-49cdee e1dk6hnl0" />
                            </div>
                        </div>
                    </div>
                                    <footer className="custom-14001an enmtwb216">
                    <div className="enmtwb26 custom-qovjty e1eopxg20">
                        <a
                            href="https://dijets.io/"
                            target="_blank"
                            rel="noopener"
                            className="custom-19y72qe enmtwb22"
                        >
                            <svg
                                width={24}
                                height={24}
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M0,3.222c.038.039.1.074.108.115a1.292,1.292,0,0,0,.612.908Q4.99,7.286,9.267,10.309a1.448,1.448,0,0,0,1.92-.022q2.333-1.65,4.661-3.309A4.825,4.825,0,0,0,17.7,4.5a8.124,8.124,0,0,0,.212-.979c0,.9.066,1.943-.017,2.972a4.174,4.174,0,0,1-1.754,3.072c-1.691,1.257-3.418,2.469-5.142,3.678a1.433,1.433,0,0,1-1.7-.069c-.563-.369-1.123-.743-1.671-1.136Q4.219,9.608.82,7.165a1.623,1.623,0,0,1-.765-1.1q.006-1.212,0-2.424A.659.659,0,0,0,0,3.454ZM0,9.755c.036.024.1.045.1.073a1.418,1.418,0,0,0,.7.983c1.3.955,2.6,1.92,3.92,2.857,1.46,1.036,2.939,2.044,4.412,3.06a1.537,1.537,0,0,0,2.155-.008c1.495-1.053,2.98-2.118,4.475-3.172a4.916,4.916,0,0,0,1.915-2.465c.13-.385.182-.8.323-1.2-.039,1.119-.006,2.246-.136,3.353A4.129,4.129,0,0,1,16.122,16.1c-1.679,1.24-3.388,2.44-5.1,3.641a1.467,1.467,0,0,1-1.779-.086c-.741-.5-1.485-1-2.213-1.52Q3.887,15.886.751,13.619a1.539,1.539,0,0,1-.468-.462,1.557,1.557,0,0,1-.231-.617c0-.819.006-1.637.005-2.458A.508.508,0,0,0,0,9.927Zm4.2-6.75a.814.814,0,0,1,.11-.125c.9-.636,1.8-1.3,2.723-1.9A5.776,5.776,0,0,1,10.218,0a5.25,5.25,0,0,1,2.954.942A10.392,10.392,0,0,1,14.4,1.9a1.73,1.73,0,0,1,.19,2.246.231.231,0,0,1-.168.124.231.231,0,0,1-.2-.06c-.2-.134-.4-.27-.6-.4a5.392,5.392,0,0,0-6.162,0c-.326.2-.649.414-.982.607a.3.3,0,0,1-.124.037.29.29,0,0,1-.127-.02c-.641-.424-1.274-.862-1.908-1.3A.938.938,0,0,1,4.2,3.005Z"
                                    fill="#fff" />
                            </svg>{" "}
                            <span>A product by Dijets</span>
                        </a>
                        <div className="custom-arn6xv enmtwb24">
                            <a href="../index.html" className="custom-1o6z30q enmtwb23">
                                Home
                            </a>
                            <a href="../research.html" className="custom-1o6z30q enmtwb23">
                                Research
                            </a>
                            <div className="custom-1xhf9xs enmtwb25" />
                            <a className="custom-1o6z30q enmtwb23">Contact us</a>
                            <a href="../privacy.html" className="custom-1o6z30q enmtwb23">
                                Privacy Policy
                            </a>
                            <a href="../terms.html" className="custom-1o6z30q enmtwb23">
                                Terms of Use
                            </a>
                            <button
                                aria-label="Toggle more or less links"
                                className="custom-zd5nwf enmtwb21"
                            >
                                <div
                                    style={{ transform: "translateY(0)" }}
                                    className="custom-qvx7b7 enmtwb20"
                                >
                                    <svg
                                        width={24}
                                        height={24}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M15.265 11.0861C15.0416 11.3139 14.6793 11.3139 14.4559 11.0861L11.9996 8.58248L9.54338 11.0861C9.31994 11.3139 8.95766 11.3139 8.73422 11.0861C8.51078 10.8584 8.51078 10.4891 8.73422 10.2614L11.595 7.3453C11.7023 7.23593 11.8479 7.17448 11.9996 7.17448C12.1514 7.17448 12.2969 7.23593 12.4042 7.3453L15.265 10.2614C15.4885 10.4891 15.4885 10.8584 15.265 11.0861Z"
                                            fill="white" />
                                    </svg>
                                </div>
                                <div
                                    style={{ transform: "translateY(0)" }}
                                    className="custom-qvx7b7 enmtwb20"
                                >
                                    <svg
                                        width={24}
                                        height={24}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M8.73399 13.0012C8.95743 12.7786 9.31971 12.7786 9.54315 13.0012L11.9994 15.4479L14.4556 13.0012C14.6791 12.7786 15.0414 12.7786 15.2648 13.0012C15.4882 13.2237 15.4882 13.5846 15.2648 13.8072L12.404 16.657C12.2967 16.7639 12.1511 16.8239 11.9994 16.8239C11.8476 16.8239 11.7021 16.7639 11.5948 16.657L8.73399 13.8072C8.51055 13.5846 8.51055 13.2237 8.73399 13.0012Z"
                                            fill="white" />
                                    </svg>
                                </div>
                            </button>
                        </div>
                    </div>
                    <div aria-hidden="true" className="enmtwb223 custom-1lhthbr e1eopxg20">
                        <div />
                        <div className="custom-zjik7 enmtwb221">
                            <div>
                                <h4 className="custom-a5oppi enmtwb222">Dijets Inc:</h4>
                                <ul className="custom-14bbtoi enmtwb219">
                                    <li className="custom-78vyka enmtwb217">
                                        <a
                                            href="https://dijets.io/about"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            About Dijets
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a
                                            href="https://dijets.io/services.html"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            Blockchains Potential
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a
                                            href="https://dijets.co.uk"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            Members Area
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a
                                            href="https://twitter.com/OfficialDijets"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            Follow us on Twitter
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="../info.html" className="custom-1o6z30q enmtwb23">
                                            We're hiring <div className="custom-1mr7i1j enmtwb218" />
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="custom-a5oppi enmtwb222">Broker integrations:</h4>
                                <ul className="custom-7vewj0 enmtwb220">
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="wealthsimple.html" className="custom-1o6z30q enmtwb23">
                                            Wealthsimple
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="etrade.html" className="custom-1o6z30q enmtwb23">
                                            E*Trade
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="robinhood.html" className="custom-1o6z30q enmtwb23">
                                            Robinhood
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="coinbase.html" className="custom-1o6z30q enmtwb23">
                                            Coinbase
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="td-ameritrade.html" className="custom-1o6z30q enmtwb23">
                                            TD Ameritrade
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="kraken.html" className="custom-1o6z30q enmtwb23">
                                            Kraken
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a
                                            href="interactive-brokers.html"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            Interactive Brokers
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="fidelity.html" className="custom-1o6z30q enmtwb23">
                                            Fidelity
                                        </a>
                                    </li>
                                    <li className="custom-78vyka enmtwb217">
                                        <a href="charles-schwab.html" className="custom-1o6z30q enmtwb23">
                                            Rogue
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </footer>
                </section>
                <div className="custom-bnetqa e1sponfi0">
                    <section className="custom-n79l10 e52ik4510">
                        <div data-component="sticky">
                            <div style={{ height: "2500px" }} className="custom-1py8sgb e1ofnsvz2">
                                <div className="custom-13udsys e1ofnsvz1">
                                    <div className="custom-f4oi1o e1ofnsvz0">
                                        <div
                                            style={{
                                                height: "100%",
                                                display: "flex",
                                                alignItems: "center"
                                            }}
                                            className="custom-xpub0y e1eopxg20"
                                        >
                                            <div className="custom-1owi8vp e52ik456">
                                                <p className="custom-1oqwi9l ex8xpf40">
                                                    <span className="custom-220rkc e1t80jvc12">
                                                        Create a Defi trade or a smart contract 'method'
                                                    </span>{" "}
                                                    and follow an asset’s performance. Rogue's intelligent
                                                    journal lets you track your decisions, always helping you
                                                    find the right opportunity to invest.
                                                </p>
                                            </div>
                                            <div className="custom-1owi8vp e52ik456">
                                                <p className="custom-1oqwi9l ex8xpf40">
                                                    <span className="custom-220rkc e1t80jvc12">
                                                        Build your thesis
                                                    </span>{" "}
                                                    with notes, images, and charts that can be imported directly
                                                    from TradingView. All in seconds, with simple key strokes.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            marginTop: "-100vh",
                                            position: "relative",
                                            overflowX: "hidden"
                                        }}
                                    >
                                        <div
                                            style={{ position: "relative" }}
                                            className="custom-12oqgqk e52ik459"
                                        >
                                            <div
                                                style={{ height: "100%" }}
                                                className="custom-xpub0y e1eopxg20"
                                            >
                                                <div className="custom-whor9r e52ik457">
                                                    <h2 className="custom-lw2me5 eq5xoa72">
                                                        <span className="custom-10uj70j e1n77l7y0">
                                                            Track your decisions.
                                                        </span>
                                                    </h2>
                                                    <p className="custom-6792g ex8xpf41">
                                                        Rogue is designed to encourage a different approach to
                                                        Fintech innovation. Rogue's Engine is fueled by collective
                                                        intelligence. Regardless of ones expertise or coding
                                                        skills, if you think your method is a good Defi Recipe,
                                                        submit it to Rogue in your Natural language.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="custom-ledcud e52ik455">
                                            <div className="custom-1qtf0zx e52ik453">
                                                <div className="custom-1h07wup e52ik452">
                                                    <img
                                                        src="images/position-aapl-20a057c718e044775ca39cad24a27dc9.svg"
                                                        alt="AAPL (Apple) Stock in Fey from E*Trade"
                                                        loading="lazy"
                                                        className="e52ik454 custom-7eeq11 e1obyj9s0" />
                                                </div>
                                                <div className="custom-1h07wup e52ik452">
                                                    <img
                                                        src="images/position-tsla-e1813faa6de7d95468bcd3fc9d4ae09e.svg"
                                                        alt="TSLA (Tesla) Stock in Fey from E*Trade"
                                                        loading="lazy"
                                                        className="e52ik454 custom-7eeq11 e1obyj9s0" />
                                                </div>
                                                <div className="custom-1h07wup e52ik452">
                                                    <img
                                                        src="images/position-amzn-5748031ba319b2c289bc85fd3794e0ec.svg"
                                                        alt="AMZON (Amazon) Stock in Fey from E*Trade"
                                                        loading="lazy"
                                                        className="e52ik454 custom-7eeq11 e1obyj9s0" />
                                                </div>
                                                <div className="custom-1h07wup e52ik452">
                                                    <img
                                                        src="images/position-sbux-a21bcdf9e84af48cbfdcabfe70cba954.svg"
                                                        alt="SBUX (Starbucks) Stock in Fey from E*Trade"
                                                        loading="lazy"
                                                        className="e52ik454 custom-7eeq11 e1obyj9s0" />
                                                </div>
                                            </div>
                                            <div className="custom-1vcq8u4 e52ik451">
                                                <div className="custom-1h07wup e52ik452">
                                                    <img
                                                        src="images/position-brkb-a3557a2511c1fc8cbd93529a16331f28.svg"
                                                        alt="BRKB (Berkshire) Stock in Fey from E*Trade"
                                                        loading="lazy"
                                                        className="e52ik454 custom-7eeq11 e1obyj9s0" />
                                                </div>
                                                <div className="custom-1h07wup e52ik452">
                                                    <img
                                                        src="images/position-pltr-ddc504e7e666433162eda71f48cdea9b.svg"
                                                        alt="PLTR (Palantir) Stock in Fey from E*Trade"
                                                        loading="lazy"
                                                        className="e52ik454 custom-7eeq11 e1obyj9s0" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="custom-1ci6ipt e52ik458" />
                                        <div className="custom-nqqtze e52ik450">
                                            <img
                                                style={{ opacity: 1, height: 131 }}
                                                src="images/canvas-1_4x-d65a4daef5d3943b599dda8c65f973cf.png"
                                                alt="Fey note input or more options"
                                                loading="lazy"
                                                className="custom-1d3w5wq e1obyj9s0" />
                                            <img
                                                style={{ opacity: 1, height: 79 }}
                                                src="images/canvas-2_4x-cd688cea3bccf436651b6c480ae68aaa.png"
                                                alt="Receiving a divident from your stock on E*Trade"
                                                loading="lazy"
                                                className="custom-1d3w5wq e1obyj9s0" />
                                            <img
                                                style={{ opacity: 1, height: 79 }}
                                                src="images/canvas-3_4x-20f12c7a9fd2fbb209bab158182c7240.png"
                                                alt="Position live on Fey"
                                                loading="lazy"
                                                className="custom-1d3w5wq e1obyj9s0" />
                                            <img
                                                style={{ opacity: 1, height: 79 }}
                                                src="images/canvas-4_4x-e412bb00b0df732bd1606268f754d140.png"
                                                alt="Fey note"
                                                loading="lazy"
                                                className="custom-1d3w5wq e1obyj9s0" />
                                            <img
                                                style={{ opacity: 1, height: 79 }}
                                                src="images/canvas-5_4x-bf04609098ddda7c4c8168f893b867cc.png"
                                                alt="Fey stop loss hit"
                                                loading="lazy"
                                                className="custom-1d3w5wq e1obyj9s0" />
                                            <img
                                                style={{ opacity: 0, height: 79 }}
                                                src="/images/broker/canvas/canvas-etrade.png"
                                                alt="You created this position in E*Trade"
                                                loading="lazy"
                                                className="custom-1d3w5wq e1obyj9s0" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section className="custom-46rqyx e1twet1i6">
                        <div style={{ height: "100%" }} className="custom-xpub0y e1eopxg20">
                            <div data-scroll-fade="true" className="custom-1kjvg36 e1twet1i5">
                                <h2 className="custom-lw2me5 eq5xoa72">
                                    <span className="custom-10uj70j e1n77l7y0">
                                        Track your decisions.
                                    </span>
                                </h2>
                                <p className="custom-6792g ex8xpf41">
                                    Rogue is designed to encourage a different approach to Fintech
                                    innovation. Rogue's Engine is fueled by collective intelligence.
                                    Regardless of ones expertise or coding skills, if you think your
                                    method is a good Defi Recipe, submit it to Rogue in your Natural
                                    language.
                                </p>
                            </div>
                            <div className="custom-bnybw8 e1twet1i4">
                                <div data-scroll-fade="true" className="custom-1ivscob e1twet1i3">
                                    <div className="custom-1o08eyv e1twet1i2">
                                        <img
                                            src="images/position-aapl-20a057c718e044775ca39cad24a27dc9.svg"
                                            alt=""
                                            loading="lazy"
                                            className="custom-1d3w5wq e1obyj9s0" />
                                    </div>
                                    <div className="custom-1o08eyv e1twet1i2">
                                        <img
                                            src="images/position-tsla-e1813faa6de7d95468bcd3fc9d4ae09e.svg"
                                            alt=""
                                            loading="lazy"
                                            className="custom-1d3w5wq e1obyj9s0" />
                                    </div>
                                    <div className="custom-1o08eyv e1twet1i2">
                                        <img
                                            src="images/position-amzn-5748031ba319b2c289bc85fd3794e0ec.svg"
                                            alt=""
                                            loading="lazy"
                                            className="custom-1d3w5wq e1obyj9s0" />
                                    </div>
                                    <div className="custom-1o08eyv e1twet1i2">
                                        <img
                                            src="images/position-sbux-a21bcdf9e84af48cbfdcabfe70cba954.svg"
                                            alt=""
                                            loading="lazy"
                                            className="custom-1d3w5wq e1obyj9s0" />
                                    </div>
                                </div>
                                <div data-scroll-fade="true" className="custom-1mqicnc e1twet1i1">
                                    <div className="custom-1o08eyv e1twet1i2">
                                        <img
                                            src="images/position-brkb-a3557a2511c1fc8cbd93529a16331f28.svg"
                                            alt=""
                                            loading="lazy"
                                            className="custom-1d3w5wq e1obyj9s0" />
                                    </div>
                                    <div className="custom-1o08eyv e1twet1i2">
                                        <img
                                            src="images/position-pltr-ddc504e7e666433162eda71f48cdea9b.svg"
                                            alt=""
                                            loading="lazy"
                                            className="custom-1d3w5wq e1obyj9s0" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section className="custom-18j4ex0 e1lesvlx11">
                        <div style={{ zIndex: 1 }} className="custom-ie5j86 e1lesvlx13">
                            <h2 data-scroll-fade="true" className="custom-1a8877e e1lesvlx2">
                                <span className="custom-10uj70j e1n77l7y0">
                                    Manage your portfolio.
                                </span>
                            </h2>
                            <div className="custom-xpub0y e1eopxg20">
                                <div
                                    style={{ transform: "translateY(-0px)" }}
                                    className="custom-1wkof6n e1lesvlx14"
                                >
                                    <div className="custom-xjp4nf eft27bk9">
                                        <div className="custom-o32htp eft27bk5">
                                            <h3 className="custom-1bv3bl8 eft27bk3">
                                                <span>Portfolio </span> <span>Returns</span>{" "}
                                            </h3>
                                            <div className="custom-19nnrhk eft27bk6" />
                                            <div className="custom-84v20e eft27bk20">
                                                <img
                                                    src="images/dashboard-graph-38574bfb7e23cad5efb133832a80519b.svg"
                                                    alt=""
                                                    loading="lazy"
                                                    className="custom-1d3w5wq e1obyj9s0" />
                                                <div className="custom-1ggczkb eft27bk8" />
                                            </div>
                                            <div className="custom-1laz9o6 eft27bk19">
                                                <div className="custom-qmtd86 eft27bk2">
                                                    <div className="custom-7poqat eft27bk0">1D</div>
                                                    <div className="custom-1j3txpn eft27bk0">1W</div>
                                                    <div className="custom-1j3txpn eft27bk0">1M</div>
                                                    <div className="custom-1j3txpn eft27bk0">3M</div>
                                                    <div className="custom-1j3txpn eft27bk0">YTD</div>
                                                    <div className="custom-1j3txpn eft27bk0">All</div>
                                                    <div className="custom-1f3miv3 eft27bk1">·</div>
                                                    <div className="custom-1j3txpn eft27bk0">Custom</div>
                                                </div>
                                                <div className="custom-1nc6n0h eft27bk18">
                                                    <strong>Net Deposits</strong> 15,000{" "}
                                                    <svg
                                                        width={16}
                                                        height={16}
                                                        viewBox="0 0 16 16"
                                                        fill="none"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                    >
                                                        <circle
                                                            cx={8}
                                                            cy={8}
                                                            r={8}
                                                            transform="rotate(90 8 8)"
                                                            fill="white"
                                                            fillOpacity="0.05" />
                                                        <path
                                                            d="M4.29122 6.58816C4.54036 6.33903 4.94421 6.33881 5.19362 6.58767L7.67978 9.06841L10.1659 6.58767C10.4153 6.33881 10.8192 6.33903 11.0683 6.58816C11.3177 6.83749 11.3177 7.24173 11.0683 7.49105L8.13232 10.4271C7.88239 10.677 7.47716 10.677 7.22723 10.4271L4.29122 7.49105C4.04189 7.24173 4.04189 6.83749 4.29122 6.58816Z"
                                                            fill="white" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="custom-ldw2b6 eft27bk4">
                                            <h3 className="custom-1bv3bl8 eft27bk3">Monthly PL</h3>
                                            <div className="custom-19nnrhk eft27bk6" />
                                            <div ref={barChartRef} className="custom-1wuabnz eft27bk17">
                                                <div className="custom-1ggczkb eft27bk8" />
                                                <div className="custom-yku3x3 eft27bk10">
                                                    <div
                                                        style={{
                                                            opacity: barChartVisible ? 1 : 0,
                                                            transitionDelay: "900ms",
                                                            bottom: "100%"
                                                        }}
                                                        className="custom-td1wa6 eft27bk13"
                                                    >
                                                        <span className="custom-38352w eft27bk11">25%</span>
                                                    </div>
                                                    <div
                                                        style={{
                                                            opacity: barChartVisible ? 1 : 0,
                                                            transitionDelay: "300ms",
                                                            bottom: "50%"
                                                        }}
                                                        className="custom-tukge8 eft27bk12"
                                                    >
                                                        <span className="custom-38352w eft27bk11">0%</span>
                                                    </div>
                                                    <div
                                                        style={{
                                                            opacity: barChartVisible ? 1 : 0,
                                                            transitionDelay: "900ms",
                                                            bottom: "10%"
                                                        }}
                                                        className="custom-td1wa6 eft27bk13"
                                                    >
                                                        <span className="custom-38352w eft27bk11">-20%</span>
                                                    </div>
                                                </div>
                                                <div className="custom-i3q0yo eft27bk16">
                                                    <div
                                                        style={{
                                                            height: "42.5531914893617%",
                                                            bottom: "22.27659574468085%",
                                                            transform: "rotate(180deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "0ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "34.04255319148936%",
                                                            bottom: "18.02127659574468%",
                                                            transform: "rotate(180deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "75ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "12.765957446808512%",
                                                            bottom: "5.382978723404256%",
                                                            transform: "rotate(0deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "150ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "53.19148936170213%",
                                                            bottom: "25.595744680851066%",
                                                            transform: "rotate(0deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "225ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "8.51063829787234%",
                                                            bottom: "5.25531914893617%",
                                                            transform: "rotate(180deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "300ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "10.638297872340425%",
                                                            bottom: "4.319148936170213%",
                                                            transform: "rotate(0deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "375ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "17.02127659574468%",
                                                            bottom: "9.51063829787234%",
                                                            transform: "rotate(180deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "450ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "34.04255319148936%",
                                                            bottom: "16.02127659574468%",
                                                            transform: "rotate(0deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "525ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "19.148936170212767%",
                                                            bottom: "8.574468085106384%",
                                                            transform: "rotate(0deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "600ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "34.04255319148936%",
                                                            bottom: "16.02127659574468%",
                                                            transform: "rotate(0deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "675ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "25.531914893617024%",
                                                            bottom: "13.765957446808512%",
                                                            transform: "rotate(180deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "750ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: "25.531914893617024%",
                                                            bottom: "11.765957446808512%",
                                                            transform: "rotate(0deg)"
                                                        }}
                                                        className="custom-1xu0uer eft27bk15"
                                                    >
                                                        <div
                                                            style={{
                                                                transform: barChartVisible ? "translateY(0)" : "translateY(102%)",
                                                                transitionDelay: "825ms",
                                                                background: "#6166DC",
                                                                opacity: "0.45"
                                                            }}
                                                            className="custom-z561dn eft27bk14" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="custom-qmtd86 eft27bk2">
                                                <div className="custom-7poqat eft27bk0">2021</div>
                                                <div className="custom-1j3txpn eft27bk0">
                                                    2020
                                                    {/* */}
                                                </div>
                                                <div className="custom-1j3txpn eft27bk0">2019</div>
                                                <div className="custom-1f3miv3 eft27bk1">·</div>
                                                <div className="custom-1j3txpn eft27bk0">Custom</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div
                                    style={{
                                        transform: "translateY(-0px)",
                                        opacity: "2.2376373215144997e-8"
                                    }}
                                    className="custom-8z421 e1lesvlx15"
                                >
                                    <div style={{ maxWidth: 555 }} className="custom-c2zhrm e1lesvlx0">
                                        <p className="custom-1nek3fs e1lesvlx1">
                                            <span className="custom-17op2u0 e1t80jvc11">
                                                Nodebook lets you monitor your {/* */}E*Trade{/* */} portfolio
                                            </span>
                                            {/* */}with a powerful dashboard. View your realized and running
                                            return, while ensuring you always know your exposure.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section className="custom-y918s6 e1tmijj13">
                        <div className="custom-11bp86c e1tmijj12">
                            <div
                                style={{ position: "relative" }}
                                className="custom-xpub0y e1eopxg20"
                            >
                                <div className="custom-bjn8wh ehp52ho16">
                                    <div className="custom-1q1crak ehp52ho15">
                                        <h2 className="custom-41ut83 ehp52ho14">
                                            The ultimate extension wallet for
                                            {/* */}
                                            <span style={{ color: "#fff", display: "inline-block" }}>
                                                Dijets
                                            </span>
                                        </h2>
                                        <form autoComplete="off">
                                            <div className="custom-ld9q1c erwllwf4">
                                                <input
                                                    type="text"
                                                    tabIndex={-1}
                                                    style={{
                                                        opacity: 0,
                                                        height: 0,
                                                        width: 0,
                                                        position: "absolute"
                                                    }}
                                                    aria-hidden="true" />
                                                <input
                                                    type="text"
                                                    id="email"
                                                    autoComplete="Off"
                                                    defaultValue=""
                                                    className="custom-hgw6ws erwllwf1" />
                                                <span className="custom-1obke9i erwllwf2">
                                                    <label
                                                        htmlFor="email"
                                                        className="custom-1yl8jmf erwllwf3"
                                                    >
                                                        Email address
                                                    </label>
                                                </span>
                                                <div className="custom-1iwbho6 erwllwf0">
                                                    <svg
                                                        width={24}
                                                        height={24}
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                    >
                                                        <path
                                                            fillRule="evenodd"
                                                            clipRule="evenodd"
                                                            d="M17.1917 17H6.74168C5.77977 17 5 16.2539 5 15.3336V8.6682C5 7.74789 5.77977 7.00184 6.74168 7.00184H17.7723C18.2933 6.97324 18.7703 7.28078 18.9382 7.75358C19.1061 8.22638 18.9236 8.74825 18.4922 9.02924L13.093 13.0007C12.4398 13.4811 11.5242 13.458 10.8985 12.9452L7.54865 10.2013C7.39102 10.0723 7.31728 9.87261 7.35522 9.6775C7.39316 9.4824 7.53701 9.32148 7.73258 9.25536C7.92816 9.18924 8.14574 9.22797 8.30338 9.35696L11.6532 12.1009C11.8664 12.2664 12.1715 12.2664 12.3847 12.1009L17.7839 8.12941L6.74168 8.11274C6.42104 8.11274 6.16112 8.36143 6.16112 8.6682V15.3336C6.16112 15.6404 6.42104 15.8891 6.74168 15.8891H17.1917C17.5124 15.8891 17.7723 15.6404 17.7723 15.3336V10.89C17.7723 10.5832 18.0322 10.3346 18.3528 10.3346C18.6735 10.3346 18.9334 10.5832 18.9334 10.89V15.3336C18.9334 16.2539 18.1536 17 17.1917 17Z"
                                                            fill="#fff" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="custom-kjymsl ehp52ho13">
                                                <button
                                                    aria-label="Request access"
                                                    className="custom-15pc524 ebptsmc0"
                                                >
                                                    <span>Request access</span>
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                            <div className="custom-1xad3c e1tmijj11">
                                <img
                                    className="e1tmijj10 custom-168flzg e1obyj9s0"
                                    src="images/macbook-light_4x-1d9330761f8e6075bd0e6ae56ea339a4.jpg"
                                    alt="Fey for trading and investing with E*Trade"
                                    loading="lazy" />
                                <img
                                    style={{ opacity: 1 }}
                                    className="e1tmijj10 custom-168flzg e1obyj9s0"
                                    src="images/macbook-dark_4x-6c3b7b5ef8554260b2b1c4433b36080b.jpg"
                                    alt="Fey for trading and investing with E*Trade"
                                    loading="lazy" />
                            </div>
                        </div>
                    </section>
                </div>
                <footer className="custom-1yx2iwp enmtwb215">
                    <div className="custom-19l6oic enmtwb214">
                        <div className="custom-10y4hc0 enmtwb213">
                            <a href="../index.html" className="custom-k8e53q enmtwb211">
                                <span className="custom-a8m0d3 enmtwb210">Home</span>
                            </a>
                            <a href="../research.html" className="custom-k8e53q enmtwb211">
                                <span className="custom-a8m0d3 enmtwb210">Research</span>
                            </a>
                            <a href="../info.html" className="custom-k8e53q enmtwb211">
                                <span className="custom-a8m0d3 enmtwb210">We're hiring</span>{" "}
                                <div className="custom-1mr7i1j enmtwb218" />
                            </a>
                            <a href="../privacy.html" className="custom-k8e53q enmtwb211">
                                <span className="custom-a8m0d3 enmtwb210">Privacy Policy</span>
                            </a>
                            <a href="../terms.html" className="custom-k8e53q enmtwb211">
                                <span className="custom-a8m0d3 enmtwb210">Terms of Use</span>
                            </a>
                            <div style={{ height: 50 }} className="custom-gov6zg enmtwb29">
                                <div className="custom-1066lcq enmtwb28">
                                    <span className="custom-a8m0d3 enmtwb210">Brokers</span>
                                    <button
                                        aria-label="Toggle more or less links"
                                        className="custom-128bg1e enmtwb21"
                                    >
                                        <div
                                            style={{ transform: "translateY(0)" }}
                                            className="custom-qvx7b7 enmtwb20"
                                        >
                                            <svg
                                                width={24}
                                                height={24}
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                xmlns="http://www.w3.org/2000/svg"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    clipRule="evenodd"
                                                    d="M15.265 11.0861C15.0416 11.3139 14.6793 11.3139 14.4559 11.0861L11.9996 8.58248L9.54338 11.0861C9.31994 11.3139 8.95766 11.3139 8.73422 11.0861C8.51078 10.8584 8.51078 10.4891 8.73422 10.2614L11.595 7.3453C11.7023 7.23593 11.8479 7.17448 11.9996 7.17448C12.1514 7.17448 12.2969 7.23593 12.4042 7.3453L15.265 10.2614C15.4885 10.4891 15.4885 10.8584 15.265 11.0861Z"
                                                    fill="white" />
                                            </svg>
                                        </div>
                                        <div
                                            style={{ transform: "translateY(0)" }}
                                            className="custom-qvx7b7 enmtwb20"
                                        >
                                            <svg
                                                width={24}
                                                height={24}
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                xmlns="http://www.w3.org/2000/svg"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    clipRule="evenodd"
                                                    d="M8.73399 13.0012C8.95743 12.7786 9.31971 12.7786 9.54315 13.0012L11.9994 15.4479L14.4556 13.0012C14.6791 12.7786 15.0414 12.7786 15.2648 13.0012C15.4882 13.2237 15.4882 13.5846 15.2648 13.8072L12.404 16.657C12.2967 16.7639 12.1511 16.8239 11.9994 16.8239C11.8476 16.8239 11.7021 16.7639 11.5948 16.657L8.73399 13.8072C8.51055 13.5846 8.51055 13.2237 8.73399 13.0012Z"
                                                    fill="white" />
                                            </svg>
                                        </div>
                                    </button>
                                </div>
                                <ul className="custom-hnyc89 enmtwb212">
                                    <li
                                        style={{ opacity: 0, transitionDelay: "0ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a href="wealthsimple.html" className="custom-1o6z30q enmtwb23">
                                            Wealthsimple
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "30ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a href="etrade.html" className="custom-1o6z30q enmtwb23">
                                            E*Trade
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "60ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a href="robinhood.html" className="custom-1o6z30q enmtwb23">
                                            Robinhood
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "90ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a href="coinbase.html" className="custom-1o6z30q enmtwb23">
                                            Coinbase
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "120ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a href="td-ameritrade.html" className="custom-1o6z30q enmtwb23">
                                            TD Ameritrade
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "150ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a href="kraken.html" className="custom-1o6z30q enmtwb23">
                                            Kraken
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "180ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a
                                            href="interactive-brokers.html"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            Interactive Brokers
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "210ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a href="fidelity.html" className="custom-1o6z30q enmtwb23">
                                            Fidelity
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "240ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a href="charles-schwab.html" className="custom-1o6z30q enmtwb23">
                                            Rogue
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div style={{ height: 50 }} className="custom-gov6zg enmtwb29">
                                <div className="custom-1066lcq enmtwb28">
                                    <span className="custom-a8m0d3 enmtwb210">Dijets Inc</span>
                                    <button
                                        aria-label="Toggle more or less links"
                                        className="custom-128bg1e enmtwb21"
                                    >
                                        <div
                                            style={{ transform: "translateY(0)" }}
                                            className="custom-qvx7b7 enmtwb20"
                                        >
                                            <svg
                                                width={24}
                                                height={24}
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                xmlns="http://www.w3.org/2000/svg"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    clipRule="evenodd"
                                                    d="M15.265 11.0861C15.0416 11.3139 14.6793 11.3139 14.4559 11.0861L11.9996 8.58248L9.54338 11.0861C9.31994 11.3139 8.95766 11.3139 8.73422 11.0861C8.51078 10.8584 8.51078 10.4891 8.73422 10.2614L11.595 7.3453C11.7023 7.23593 11.8479 7.17448 11.9996 7.17448C12.1514 7.17448 12.2969 7.23593 12.4042 7.3453L15.265 10.2614C15.4885 10.4891 15.4885 10.8584 15.265 11.0861Z"
                                                    fill="white" />
                                            </svg>
                                        </div>
                                        <div
                                            style={{ transform: "translateY(0)" }}
                                            className="custom-qvx7b7 enmtwb20"
                                        >
                                            <svg
                                                width={24}
                                                height={24}
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                xmlns="http://www.w3.org/2000/svg"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    clipRule="evenodd"
                                                    d="M8.73399 13.0012C8.95743 12.7786 9.31971 12.7786 9.54315 13.0012L11.9994 15.4479L14.4556 13.0012C14.6791 12.7786 15.0414 12.7786 15.2648 13.0012C15.4882 13.2237 15.4882 13.5846 15.2648 13.8072L12.404 16.657C12.2967 16.7639 12.1511 16.8239 11.9994 16.8239C11.8476 16.8239 11.7021 16.7639 11.5948 16.657L8.73399 13.8072C8.51055 13.5846 8.51055 13.2237 8.73399 13.0012Z"
                                                    fill="white" />
                                            </svg>
                                        </div>
                                    </button>
                                </div>
                                <ul className="custom-hnyc89 enmtwb212">
                                    <li
                                        style={{ opacity: 0, transitionDelay: "0ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a
                                            href="https://dijets.io/about"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            About Dijets
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "30ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a
                                            href="https://dijets.io/services.html"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            Blockchains Potential
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "60ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a
                                            href="https://dijets.co.uk"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            Members Area
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "90ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a
                                            href="https://twitter.com/OfficialDijets"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23"
                                        >
                                            Follow us on Twitter
                                        </a>
                                    </li>
                                    <li
                                        style={{ opacity: 0, transitionDelay: "120ms" }}
                                        className="custom-78vyka enmtwb217"
                                    >
                                        <a
                                            href="../info.html"
                                            target="_blank"
                                            rel="noopener"
                                            className="custom-1o6z30q enmtwb23" />
                                    </li>
                                </ul>
                            </div>
                        </div>
                        <div className="custom-fcl1ju enmtwb27">
                            <a
                                href="https://dijets.io/"
                                target="_blank"
                                rel="noopener"
                                className="custom-19y72qe enmtwb22"
                            >
                                <span>A product by Dijets</span>
                                <svg
                                    width={24}
                                    height={24}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M0,3.222c.038.039.1.074.108.115a1.292,1.292,0,0,0,.612.908Q4.99,7.286,9.267,10.309a1.448,1.448,0,0,0,1.92-.022q2.333-1.65,4.661-3.309A4.825,4.825,0,0,0,17.7,4.5a8.124,8.124,0,0,0,.212-.979c0,.9.066,1.943-.017,2.972a4.174,4.174,0,0,1-1.754,3.072c-1.691,1.257-3.418,2.469-5.142,3.678a1.433,1.433,0,0,1-1.7-.069c-.563-.369-1.123-.743-1.671-1.136Q4.219,9.608.82,7.165a1.623,1.623,0,0,1-.765-1.1q.006-1.212,0-2.424A.659.659,0,0,0,0,3.454ZM0,9.755c.036.024.1.045.1.073a1.418,1.418,0,0,0,.7.983c1.3.955,2.6,1.92,3.92,2.857,1.46,1.036,2.939,2.044,4.412,3.06a1.537,1.537,0,0,0,2.155-.008c1.495-1.053,2.98-2.118,4.475-3.172a4.916,4.916,0,0,0,1.915-2.465c.13-.385.182-.8.323-1.2-.039,1.119-.006,2.246-.136,3.353A4.129,4.129,0,0,1,16.122,16.1c-1.679,1.24-3.388,2.44-5.1,3.641a1.467,1.467,0,0,1-1.779-.086c-.741-.5-1.485-1-2.213-1.52Q3.887,15.886.751,13.619a1.539,1.539,0,0,1-.468-.462,1.557,1.557,0,0,1-.231-.617c0-.819.006-1.637.005-2.458A.508.508,0,0,0,0,9.927Zm4.2-6.75a.814.814,0,0,1,.11-.125c.9-.636,1.8-1.3,2.723-1.9A5.776,5.776,0,0,1,10.218,0a5.25,5.25,0,0,1,2.954.942A10.392,10.392,0,0,1,14.4,1.9a1.73,1.73,0,0,1,.19,2.246.231.231,0,0,1-.168.124.231.231,0,0,1-.2-.06c-.2-.134-.4-.27-.6-.4a5.392,5.392,0,0,0-6.162,0c-.326.2-.649.414-.982.607a.3.3,0,0,1-.124.037.29.29,0,0,1-.127-.02c-.641-.424-1.274-.862-1.908-1.3A.938.938,0,0,1,4.2,3.005Z"
                                        fill="#fff" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </footer>
            </div>
        </div></>


    )
}

export default FaucetForm

//<div className='container'>
                //<div className="box">
                    //<div className='banner' style={{ backgroundImage: `url(${props.config.banner})` }} />

                    //<div className='box-content'>
                        //<div className='box-header'>
                            //<span>
                                //<span style={{ color: "grey" }}>Network</span>
                            //</span>

                            //<ChainDropdown /> <br />

                            //<div>
                                //<div style={{ width: "100%" }}>
                                    //<span style={{ color: "grey", fontSize: "12px", float: "right" }}>
                                        //<span>Faucet balance: {calculateLargestUnit(balance, chainConfigs[token!]?.DECIMALS)} {chainConfigs[token!]?.TOKEN}</span>
                                    //</span>

                                    //<span style={{ color: "grey", fontSize: "12px" }}>
                                        //Select Token
                                    //</span>

                                    //<TokenDropdown />
                                //</div>
                            //</div>
                        //</div>

                        //<br />

                        //<div style={{ display: sendTokenResponse?.txHash ? "block" : "block" }}>
                            //<p className='rate-limit-text'>
                                //Please input your Utility Chain address below:
                            //</p>

                            //<div className='address-input'>
                                //<input
                                    //placeholder='Dijets Utility Chain Address (0x...)'
                                    //value={inputAddress || ""}
                                    //onChange={(e) => updateAddress(e.target.value)}
                                    //autoFocus />

                                //<span className='connect-metamask' onClick={() => connectAccount(updateAddress)}>
                                    //<img alt='nodebook' src="/connect-nodebook.png" />
                                    //Connect
                                //</span>
                            //</div>
                            //<span className='rate-limit-text' style={{ color: "#64ffc7", display: "flex", justifyContent: "center", fontWeight: "bold", paddingTop: "12px" }}>{sendTokenResponse?.message}</span>

                            //<div className='v2-recaptcha' style={{ marginTop: "10px" }}></div>

                            //<div className="beta-alert">
                                //<p>Drops are limited to 1 submission per 24 hours.</p>
                            //</div>
                            //<div className="greenz">
                                //<button className={shouldAllowSend ? 'custom-15pc524 ebptsmc0' : 'custom-15pc524-disabled'} onClick={sendToken}>
                                    //{isLoading
                                        //?
                                        //<ClipLoader size="20px" speedMultiplier={0.3} color="403F40" />
                                        //:
                                        //<span>Request {chainConfigs[token || 0]?.DRIP_AMOUNT} {chainConfigs[token || 0]?.TOKEN}</span>}
                                //</button>
                            //</div>

                            //<div style={{ display: sendTokenResponse?.txHash ? "block" : "none" }}>
                                //<p style={{ display: "none" }}>
                                    //{sendTokenResponse?.message}
                                //</p>
                                //<div className="ratta">
                                    //<span className='bold-text'>Click below to view your transaction in explorer</span>
                                    //<p className='rate-limit-texter'>
                                        //<a
                                            //target={'_blank'}
                                           // href={chainConfigs[token!]?.EXPLORER + '/tx/' + sendTokenResponse?.txHash}
                                           // rel="noreferrer"
                                      //  >
                                         //   {sendTokenResponse?.txHash}
                                       // </a>
                                    //</p>
                                //</div>

                                //<button className='back-button' onClick={back}>Request another drop</button>
                            //</div>
                        //</div>
                    //</div>

                    //<FooterBox
                        //chain={chain}
                        //token={token}
                        //chainConfigs={chainConfigs}
                        //chainToIndex={chainToIndex}
                        //faucetAddress={faucetAddress} />
                //</div>
            //</div>