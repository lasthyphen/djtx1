import { addNetwork, addAsset } from "./Metamask"

export default function AddNetwork(props: any) {
    return (
        <div className='footer-buttons'>
            <button className="add-network" onClick={() => {addNetwork(props.config)}}>
                <img alt='metamask' style={{width: "24px", height: "24px", marginRight: "5px"}} src="/memtamask.webp"/>
                Add Dijets to Metamask
            </button>

            <button className="add-network" onClick={() => {window.open(`${props.config.EXPLORER}${props.token?.CONTRACTADDRESS ? "/address/" + props.token.CONTRACTADDRESS : ""}`, '_blank')}}>
                <img alt="block-explorer" style={{width: "24px", height: "24px"}} src="/chain.png"/>
                View Block Explorer
            </button>

            {
                props?.token?.CONTRACTADDRESS
                &&
                <button className="add-network" onClick={() => {addAsset(props?.token)}}>
                    <img alt='asset' style={{width: "22px", height: "22px", marginRight: "5px", borderRadius: "25px"}} src={props?.token?.IMAGE}/>
                    Add Asset to Metamask
                </button>
            }
        </div>
    )
}