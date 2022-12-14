import { useState } from 'react' 
import './styles/Contribute.css'

const Contribute = () => {
    const [hiddenClass, setHiddenClass] = useState('')

    setTimeout(() => {
        setHiddenClass("hide-button")
    }, 2000)

    return (
        <div
            className = {`contribute-button ${hiddenClass}`}
            onClick={
                () => {
                    window.open('https://dijets.io', '_blank')
                }
            }>
            <img alt='github' src="/github.webp"/>
            Learn more about Dijets
        </div>
    )
}

export default Contribute