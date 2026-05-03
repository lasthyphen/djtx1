import { addNetwork, addAsset } from "./Metamask"

export default function AddNetwork(props: any) {
    return (
        <div className='footer-buttons'>
            <button className="add-network" onClick={() => {addNetwork(props.config)}}>
                <img alt='metamask' style={{width: "20px", height: "20px", marginRight: "8px"}} src="/connect-nodebook.png"/>
                Nodebook
            </button>

            <button className="add-network" onClick={() => {window.open(`${props.config.EXPLORER}${props.token?.CONTRACTADDRESS ? "/address/" + props.token.CONTRACTADDRESS : ""}`, '_blank')}}>
                <img alt="block-explorer" style={{width: "20px", height: "20px", marginRight: "8px"}} src="/chain.png"/>
                Explorer
            </button>

            {
                props?.token?.CONTRACTADDRESS
                &&
                <button className="add-network" onClick={() => {addAsset(props?.token)}}>
                    <img alt='asset' style={{width: "19px", height: "19px", marginRight: "5px", borderRadius: "25px"}} src={props?.token?.IMAGE}/>
                    Add DJT
                </button>
            }
        </div>
    )
}